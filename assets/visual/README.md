# assets/visual/

Хранилище визуальных вариантов Unified Visual Pipeline (PlayArcEngine UVP):
`assets/visual/<profileId>/` держит спрайты/модели каждого профиля рядом, чтобы
переходы 2d → full3d → 2d не требовали бэкапов.

Для «Фабрики Грёз» каталог заполнится в фазе ROADMAP «Движок: UVP» (порт
студийного симулятора на GAME_SPEC + presentation/variants); до тех пор игра
представляет себя собственными engine-модулями (SetPieces3D, ActorRig3D,
CinePost3D, Sky3D), и каталог пуст намеренно.
