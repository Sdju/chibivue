import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress'

export const ruConfig: LocaleSpecificConfig<DefaultTheme.Config> = {
  themeConfig: {
    nav: [
      { text: 'Главная', link: '/ru/' },
      { text: 'Начать обучение', link: '/ru/00-introduction/010-about' },
      { text: 'Контакты', link: '/ru/contacts' },
    ],
    sidebar: [
      {
        text: 'Начало работы',
        collapsed: false,
        items: [
          { text: 'Введение', link: '/ru/00-introduction/010-about' },
          {
            text: 'Что такое Vue.js?',
            link: '/ru/00-introduction/020-what-is-vue',
          },
          {
            text: 'Ключевые элементы Vue.js',
            link: '/ru/00-introduction/030-vue-core-components',
          },
          {
            text: 'Подход в этой книге и настройка окружения',
            link: '/ru/00-introduction/040-setup-project',
          },
        ],
      },
      {
        text: 'Минимальный пример',
        collapsed: false,
        items: [
          {
            text: 'Первый рендеринг и API createApp',
            link: '/ru/10-minimum-example/010-create-app-api',
          },
          {
            text: 'Архитектура пакета',
            link: '/ru/10-minimum-example/015-package-architecture',
          },
          {
            text: 'Добавим рендеринг HTML-элементов',
            link: '/ru/10-minimum-example/020-simple-h-function',
          },
          {
            text: 'Добавим поддержку обработчиков событий и атрибутов',
            link: '/ru/10-minimum-example/025-event-handler-and-attrs',
          },
          {
            text: 'Необходимые знания для системы реактивности',
            link: '/ru/10-minimum-example/030-prerequisite-knowledge-for-the-reactivity-system',
          },
          {
            text: 'Попробуем реализовать минимальную систему реактивности',
            link: '/ru/10-minimum-example/035-try-implementing-a-minimum-reactivity-system',
          },
          {
            text: 'Минимальный Virtual DOM',
            link: '/ru/10-minimum-example/040-minimum-virtual-dom',
          },
          {
            text: 'Стремление к компонентно-ориентированной разработке',
            link: '/ru/10-minimum-example/050-minimum-component',
          },
          {
            text: 'Пропсы компонентов',
            link: '/ru/10-minimum-example/051-component-props',
          },
          {
            text: 'События компонентов (Emit)',
            link: '/ru/10-minimum-example/052-component-emits',
          },
          {
            text: 'Понимание компилятора шаблонов',
            link: '/ru/10-minimum-example/060-template-compiler',
          },
          {
            text: 'Реализация компилятора шаблонов',
            link: '/ru/10-minimum-example/061-template-compiler-impl',
          },
          {
            text: 'Желание писать более сложный HTML',
            link: '/ru/10-minimum-example/070-more-complex-parser',
          },
          {
            text: 'Привязка данных',
            link: '/ru/10-minimum-example/080-template-binding',
          },
          {
            text: 'Разработка с SFC (предварительные знания)',
            link: '/ru/10-minimum-example/090-prerequisite-knowledge-for-the-sfc',
          },
          {
            text: 'Парсинг SFC',
            link: '/ru/10-minimum-example/091-parse-sfc',
          },
          {
            text: 'Блок шаблона SFC',
            link: '/ru/10-minimum-example/092-compile-sfc-template',
          },
          {
            text: 'Блок скрипта SFC',
            link: '/ru/10-minimum-example/093-compile-sfc-script',
          },
          {
            text: 'Блок стилей SFC',
            link: '/ru/10-minimum-example/094-compile-sfc-style',
          },
          {
            text: 'Небольшой перерыв',
            link: '/ru/10-minimum-example/100-break',
          },
        ],
      },
      {
        text: 'Базовый Virtual DOM',
        collapsed: false,
        items: [
          {
            text: 'Атрибут key и патч-рендеринг',
            link: '/ru/20-basic-virtual-dom/010-patch-keyed-children',
          },
          {
            text: 'Битовое представление VNodes',
            link: '/ru/20-basic-virtual-dom/020-bit-flags',
          },
          {
            text: 'Планировщик',
            link: '/ru/20-basic-virtual-dom/030-scheduler',
          },
          {
            text: '🚧 Патч для необработанных пропсов',
            link: '/ru/20-basic-virtual-dom/040-patch-other-attrs',
          },
        ],
      },
      {
        text: 'Базовая система реактивности',
        collapsed: false,
        items: [
          {
            text: '🚧 Оптимизация реактивности',
            link: '/ru/30-basic-reactivity-system/005-reactivity-optimization.md',
          },
          {
            text: 'API ref',
            link: '/ru/30-basic-reactivity-system/010-ref-api',
          },
          {
            text: 'API computed / watch',
            link: '/ru/30-basic-reactivity-system/020-computed-watch',
          },
          {
            text: 'Различные обработчики реактивных прокси',
            link: '/ru/30-basic-reactivity-system/030-reactive-proxy-handlers',
          },
          {
            text: 'Очистка эффектов и область видимости эффектов',
            link: '/ru/30-basic-reactivity-system/040-effect-scope',
          },
          {
            text: 'Другие API реактивности',
            link: '/ru/30-basic-reactivity-system/050-other-apis',
          },
        ],
      },
      {
        text: 'Базовая система компонентов',
        collapsed: false,
        items: [
          {
            text: 'Хуки жизненного цикла',
            link: '/ru/40-basic-component-system/010-lifecycle-hooks',
          },
          {
            text: 'Provide/Inject',
            link: '/ru/40-basic-component-system/020-provide-inject',
          },
          {
            text: 'Прокси компонентов и setupContext',
            link: '/ru/40-basic-component-system/030-component-proxy-setup-context',
          },
          {
            text: 'Слоты',
            link: '/ru/40-basic-component-system/040-component-slot',
          },
          {
            text: 'Поддержка Options API',
            link: '/ru/40-basic-component-system/050-options-api',
          },
        ],
      },
      {
        text: 'Базовый компилятор шаблонов',
        collapsed: false,
        items: [
          {
            text: 'Рефакторинг реализации трансформера для генерации кода',
            link: '/ru/50-basic-template-compiler/010-transform',
          },
          {
            text: 'Реализация директив (v-bind)',
            link: '/ru/50-basic-template-compiler/020-v-bind',
          },
          {
            text: 'Вычисление выражений в шаблоне',
            link: '/ru/50-basic-template-compiler/022-transform-expression',
          },
          {
            text: 'Поддержка v-on',
            link: '/ru/50-basic-template-compiler/025-v-on',
          },
          {
            text: 'compiler-dom и модификаторы событий',
            link: '/ru/50-basic-template-compiler/027-event-modifier',
          },
          {
            text: 'Поддержка Fragment',
            link: '/ru/50-basic-template-compiler/030-fragment',
          },
          {
            text: 'Поддержка узлов комментариев',
            link: '/ru/50-basic-template-compiler/035-comment',
          },
          {
            text: 'v-if и структурные директивы',
            link: '/ru/50-basic-template-compiler/040-v-if-and-structural-directive',
          },
          {
            text: 'Поддержка v-for',
            link: '/ru/50-basic-template-compiler/050-v-for',
          },
          {
            text: 'Разрешение компонентов',
            link: '/ru/50-basic-template-compiler/070-resolve-component',
          },
          {
            text: 'Поддержка слотов (определение)',
            link: '/ru/50-basic-template-compiler/080-component-slot-outlet',
          },
          {
            text: '🚧 Другие директивы',
            link: '/ru/50-basic-template-compiler/090-other-directives',
          },
          {
            text: '🚧 Рутинные задачи компилятора',
            link: '/ru/50-basic-template-compiler/100-chore-compiler',
          },
          {
            text: '🚧 Пользовательские директивы',
            link: '/ru/50-basic-template-compiler/500-custom-directive',
          },
        ],
      },
      {
        text: '🚧 Базовый компилятор SFC',
        collapsed: true,
        items: [
          {
            text: 'Поддержка script setup',
            link: '/ru/60-basic-sfc-compiler/010-script-setup',
          },
          {
            text: 'Поддержка defineProps',
            link: '/ru/60-basic-sfc-compiler/020-define-props',
          },
          {
            text: 'Поддержка defineEmits',
            link: '/ru/60-basic-sfc-compiler/030-define-emits',
          },
          {
            text: 'Поддержка Scoped CSS',
            link: '/ru/60-basic-sfc-compiler/040-scoped-css',
          },
        ],
      },
      {
        text: '🚧 Основы веб-приложений',
        collapsed: true,
        items: [
          {
            text: '🚧 Плагины',
            collapsed: false,
            items: [
              {
                text: 'Маршрутизатор',
                link: '/ru/90-web-application-essentials/010-plugins/010-router',
              },
              {
                text: 'Препроцессоры',
                link: '/ru/90-web-application-essentials/010-plugins/020-preprocessors',
              },
            ],
          },

          {
            text: '🚧 Серверный рендеринг',
            collapsed: false,
            items: [
              {
                text: 'createSSRApp',
                link: '/ru/90-web-application-essentials/020-ssr/010-create-ssr-app',
              },
              {
                text: 'Гидратация',
                link: '/ru/90-web-application-essentials/020-ssr/020-hydration',
              },
            ],
          },
          {
            text: '🚧 Встроенные компоненты',
            collapsed: false,
            items: [
              {
                text: 'KeepAlive',
                link: '/ru/90-web-application-essentials/030-builtins/010-keep-alive',
              },
              {
                text: 'Suspense',
                link: '/ru/90-web-application-essentials/030-builtins/020-suspense',
              },
              {
                text: 'Transition',
                link: '/ru/90-web-application-essentials/030-builtins/030-transition',
              },
            ],
          },
          {
            text: '🚧 Оптимизации',
            collapsed: false,
            items: [
              {
                text: 'Статический хоистинг',
                link: '/ru/90-web-application-essentials/040-optimizations/010-static-hoisting',
              },
              {
                text: 'Флаги патчей',
                link: '/ru/90-web-application-essentials/040-optimizations/020-patch-flags',
              },
              {
                text: 'Выравнивание дерева',
                link: '/ru/90-web-application-essentials/040-optimizations/030-tree-flattening',
              },
            ],
          },
        ],
      },
      {
        text: 'Приложение',
        collapsed: false,
        items: [
          {
            text: 'Написание Vue.js за 15 минут',
            collapsed: true,
            items: [
              {
                text: 'chibivue, разве он не маленький...?',
                link: '/ru/bonus/hyper-ultimate-super-extreme-minimal-vue/',
              },
              {
                text: 'Реализация',
                link: '/ru/bonus/hyper-ultimate-super-extreme-minimal-vue/15-min-impl.md',
              },
            ],
          },
          {
            text: 'Отладка исходного кода Vue.js',
            link: '/ru/bonus/debug-vuejs-core',
          },
        ],
      },
    ],
    editLink: {
      pattern:
        'https://github.com/chibivue-land/chibivue/blob/main/book/online-book/src/:path',
      text: 'Предложить изменения для этой страницы',
    },
  },
}
