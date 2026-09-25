# ============================================================================
#  tools/actors/convert.py — драйвер Blender 3.4 для конвертации CC0-актёров
# ----------------------------------------------------------------------------
#  blender -b -P tools/actors/convert.py -- '<jsonJob>'
#
#  Типы задач (job.type):
#    kenney — characterMedium.fbx + idle/jump/run.fbx + PNG-скин → GLB
#             (текстура назначается материалу, лишние арматуры удаляются);
#    kaykit — GLB персонажа + GLB-анимации общего Rig_Medium/Rig_Large →
#             выбранные экшены переименовываются и пекутся NLA-треками;
#    fbx    — одиночный FBX (Quaternius): все экшены → GLB.
#
#  Общие шаги: импорт → чистка/переименование экшенов → нормирование роста
#  (bbox.height → targetM, ноги на z=0) → поворот yawDeg → NLA → экспорт GLB.
#  Имя анимации в GLB = имя экшена (экспортер 3.4, см. gather_animations).
# ============================================================================
import bpy
import json
import math
import re
import sys

import mathutils

argv = sys.argv[sys.argv.index('--') + 1:]
JOB = json.loads(argv[0])


def bbox_z():
    zs = []
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            zs.append((o.matrix_world @ mathutils.Vector(c)).z)
    return (min(zs), max(zs)) if zs else (0.0, 0.0)


def reparent_to_root():
    tops = [o for o in bpy.data.objects if o.parent is None]
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
    root = bpy.context.active_object
    root.name = 'ActorRoot'
    for o in tops:
        if o is not root:
            o.parent = root
            o.matrix_parent_inverse = root.matrix_world.inverted()
    return root


def normalize(target_m, yaw_deg):
    if not target_m:
        return
    z0, z1 = bbox_z()
    h = z1 - z0
    if h <= 1e-6:
        return
    root = bpy.data.objects.get('ActorRoot') or reparent_to_root()
    s = target_m / h
    root.scale = (s, s, s)
    if yaw_deg:
        root.rotation_euler.z = math.radians(yaw_deg)
    bpy.context.view_layer.update()
    z0, _ = bbox_z()
    root.location.z -= z0
    bpy.context.view_layer.update()


def push_nla(arm, mapping):
    """mapping: {финальное_имя: action}. Каждая — отдельный NLA-трек (клип GLB)."""
    if arm.animation_data is None:
        arm.animation_data_create()
    ad = arm.animation_data
    ad.action = None
    for tr in list(ad.nla_tracks):
        ad.nla_tracks.remove(tr)
    for final, act in mapping.items():
        act.name = final
        tr = ad.nla_tracks.new()
        tr.name = final
        st = tr.strips.new(final, int(round(act.frame_range[0])), act)
        st.name = final


def keep_objects(keep):
    for o in list(bpy.data.objects):
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)


def char_armature():
    """Арматура персонажа: та, у которой есть дочерний меш (скин)."""
    for o in bpy.data.objects:
        if o.type == 'ARMATURE':
            for c in o.children:
                if c.type == 'MESH':
                    return o
    for o in bpy.data.objects:
        if o.type == 'ARMATURE':
            return o
    return None


def clean_action_name(n):
    return n.split('|')[-1].strip()


def strip_dupe_suffix(n):
    # импорт GLB плодит дубликаты «Имя.001» — числовой суффикс снимаем
    return re.sub(r'\.\d+$', '', n)


def export(out):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format='GLB',
        export_image_format='AUTO',
        export_animations=True,
        export_skins=True,
        export_yup=True,
        use_selection=False,
    )


def do_kenney(job):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=job['model'])
    model_objs = set(bpy.data.objects) - before
    for path in job['anims'].values():
        before2 = set(bpy.data.objects)
        bpy.ops.import_scene.fbx(filepath=path)
        for o in set(bpy.data.objects) - before2:
            bpy.data.objects.remove(o, do_unlink=True)   # объекты анимаций не нужны
    # экшены: оставить только запрошенные клипы
    mapping = {}
    for a in list(bpy.data.actions):
        cn = clean_action_name(a.name)
        if cn in job['anims'] and 'Targeting' not in cn:
            mapping[cn] = a
        else:
            bpy.data.actions.remove(a)
    keep_objects(model_objs)
    arm = char_armature()
    # скин-текстура в материал
    img = bpy.data.images.load(job['skin'])
    img.pack()
    for m in bpy.data.materials:
        if not m.use_nodes:
            m.use_nodes = True
        bsdf = None
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                bsdf = n
        if bsdf is None:
            continue
        tex = None
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE':
                tex = n
        if tex is None:
            tex = m.node_tree.nodes.new('ShaderNodeTexImage')
            tex.location = (bsdf.location[0] - 320, bsdf.location[1])
            m.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        tex.image = img
    push_nla(arm, mapping)
    normalize(job.get('targetM'), job.get('yawDeg', 0))
    export(job['out'])


def do_kaykit(job):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=job['char'])
    char_objs = set(bpy.data.objects) - before
    wanted = set(job['clips'])
    for path in job['anims']:
        before2 = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        for o in set(bpy.data.objects) - before2:
            bpy.data.objects.remove(o, do_unlink=True)
    mapping = {}
    for a in list(bpy.data.actions):
        cn = strip_dupe_suffix(a.name)
        for suf in ('_Rig_Medium', '_Rig_Large'):
            if cn.endswith(suf):
                cn = cn[: -len(suf)]
        cn = clean_action_name(cn)
        if cn in wanted and cn not in mapping:
            mapping[cn] = a
        else:
            bpy.data.actions.remove(a)
    missing = wanted - set(mapping)
    if missing:
        print('WARN missing clips:', sorted(missing))
    keep_objects(char_objs)
    arm = char_armature()
    push_nla(arm, mapping)
    normalize(job.get('targetM'), job.get('yawDeg', 0))
    export(job['out'])


def do_fbx(job):
    bpy.ops.import_scene.fbx(filepath=job['src'])
    mapping = {}
    for a in list(bpy.data.actions):
        cn = strip_dupe_suffix(clean_action_name(a.name))
        if 'Targeting' in cn or cn == 'T-Pose':
            bpy.data.actions.remove(a)
            continue
        if cn not in mapping:
            mapping[cn] = a
        else:
            bpy.data.actions.remove(a)
    arm = char_armature()
    push_nla(arm, mapping)
    normalize(job.get('targetM'), job.get('yawDeg', 0))
    export(job['out'])


bpy.ops.wm.read_factory_settings(use_empty=True)
t = JOB['type']
if t == 'kenney':
    do_kenney(JOB)
elif t == 'kaykit':
    do_kaykit(JOB)
elif t == 'fbx':
    do_fbx(JOB)
else:
    raise SystemExit('unknown job type: ' + t)
print('CONVERT OK:', JOB['out'])
