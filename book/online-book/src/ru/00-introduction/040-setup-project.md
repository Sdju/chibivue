# Как продолжить работу с этой книгой и настройка окружения

## Как продолжить работу с этой книгой

Мы оперативно начнем с простой реализации Vue.js. Вот некоторые моменты, которые следует учитывать, меры предосторожности и другая важная информация:

- Название проекта будет "chibivue". Мы будем называть базовые реализации Vue.js, рассматриваемые в этой книге, как "chibivue".
- Как было изначально упомянуто, наш основной подход будет "повторение небольших разработок".
- Исходные коды для каждого этапа включены в приложение к этой книге и их можно найти по адресу https://github.com/chibivue-land/chibivue/tree/main/book/impls. Мы не будем предоставлять подробные объяснения для всего исходного кода в книге, поэтому при необходимости обращайтесь к приложению.
- Итоговый код зависит от нескольких пакетов. Обычной проблемой с DIY-контентом является дискуссия о том, "сколько нужно реализовать вручную, чтобы назвать это самодельным". Хотя мы не будем писать весь исходный код вручную в этой книге, мы будем активно использовать пакеты, аналогичные тем, которые используются в официальном коде Vue.js. Например, мы будем использовать [Babel](https://babeljs.io/). Будьте уверены, мы стремимся сделать эту книгу максимально доступной для начинающих, предоставляя минимальные объяснения для необходимых пакетов.

## Настройка окружения

Теперь давайте быстро перейдем к настройке окружения! \
Я перечислю инструменты и версии, которые мы будем использовать:

- Среда выполнения: [Node.js](https://nodejs.org/en) v22
- Язык: [TypeScript](https://www.typescriptlang.org/)
- Менеджер пакетов: [pnpm](https://pnpm.io/) v9
- Инструмент сборки: [Vite](https://vite.dev/) v6

## Установка Node.js

Большинство из вас, вероятно, знакомы с этим шагом. Пожалуйста, настройте его самостоятельно. Мы пропустим подробное объяснение здесь.

## Установка pnpm

Многие из вас, возможно, обычно используют npm или yarn. Для этой книги мы будем использовать pnpm, поэтому, пожалуйста, установите его также. Команды в основном аналогичны npm.
https://pnpm.io/installation

В дополнение к вышеупомянутому, эта книга также использует [ni](https://github.com/antfu/ni), который можно с юмором назвать "менеджером менеджеров пакетов". \
(Он был создан antfu из основной команды Vue.js.)

Если вы еще не настроили его, пожалуйста, также установите его:

```sh
$ npm i -g @antfu/ni
```

[ni](https://github.com/antfu/ni) - это удобный инструмент, который автоматически переключается между различными менеджерами пакетов для вас.

Интересно, что этот инструмент также используется в фактической разработке Vue.js. \
https://github.com/vuejs/core/blob/main/.github/contributing.md#scripts

Для установки пакетов, запуска сервера разработки и других задач мы будем использовать команду ni.

## Создание проекта

::: details Быстрый старт для тех, кто торопится ...

Хотя я буду объяснять шаги для создания проекта вручную, на самом деле для настройки подготовлен инструмент. \
Если вы считаете ручной процесс утомительным, пожалуйста, не стесняйтесь использовать этот инструмент!

1. Клонируйте chibivue.

   ```sh
   $ git clone https://github.com/chibivue-land/chibivue
   ```

2. Выполните скрипт. \
    Введите путь к директории, которую вы хотите настроить.

   ```sh
   $ cd chibivue
   $ nr setup ../my-chibivue-project
   ```

:::

Создайте проект в любой директории по вашему выбору. Для удобства мы обозначим корневой путь проекта как `~` (например, `~/src/main.ts`).

В этот раз мы отделим основной "chibivue" от игровой площадки для тестирования его функциональности. Playground будет просто вызывать "chibivue" и связывать его с Vite. Мы предполагаем структуру примерно такую.

```
~
|- examples
|    |- playground
|
|- packages
|- tsconfig.js
```

Мы реализуем playground в директории с названием "examples."
Мы реализуем основные файлы TypeScript для chibivue в "packages" и импортируем их со стороны примера.

Ниже приведены шаги для его построения.

### Построение основного проекта

```sh
## Пожалуйста, создайте директорию специально для chibivue и перейдите в неё. (Такие примечания будут опущены в дальнейшем.)
pwd # ~/
pnpm init
ni -D @types/node
mkdir packages
touch packages/index.ts
touch tsconfig.json
```

Содержимое tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "lib": ["DOM", "ES2020"],
    "strict": true,
    "paths": {
      "chibivue": ["./packages"]
    },
    "moduleResolution": "Bundler",
    "allowJs": true,
    "esModuleInterop": true
  },
  "include": ["packages/**/*.ts", "examples/**/**.ts"],
  "exclude": ["node_modules", "dist"]
}
```

Содержимое packages/index.ts

```ts
console.log("Hello, World")
```

### Построение стороны Playground

```sh
pwd # ~/
mkdir examples
cd examples
nlx create-vite

## --------- Настройка с использованием CLI Vite
## Название проекта: playground
## Выберите фреймворк: Vanilla
## Выберите вариант: TypeScript
```

Удалите ненужные элементы из проекта, созданного с помощью Vite.

```sh
pwd # ~/examples/playground
rm -rf public
rm -rf src # Мы пересоздадим его, так как есть ненужные файлы.
mkdir src
touch src/main.ts
```

Содержимое src/main.ts

※ Пока будет ошибка после "from", но мы решим эту проблему в ближайших шагах, так что это не проблема.

```ts
import "chibivue"
```

Измените index.html следующим образом.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>chibivue</title>
  </head>

  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Настройте псевдоним в проекте Vite, чтобы иметь возможность импортировать то, что вы реализовали в chibivue.

```sh
pwd # ~/examples/playground
touch vite.config.js
```

Содержимое vite.config.js

```ts
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const dirname = path.dirname(fileURLToPath(new URL(import.meta.url)))
export default defineConfig({
  resolve: {
    alias: {
      chibivue: path.resolve(dirname, '../../packages'),
    },
  },
})
```

Измените tsconfig.json следующим образом.

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ESNext", "DOM"],
    "moduleResolution": "Node",
    "strict": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "noEmit": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "skipLibCheck": true,
    "paths": {
      "chibivue": ["../../packages"]
    }
  },
  "include": ["src"]
}
```

Наконец, давайте добавим команду в package.json проекта chibivue для запуска playground и попробуем запустить его!

Добавьте следующее в ~/package.json

```json
{
  "scripts": {
    "dev": "cd examples/playground && pnpm i && pnpm run dev"
  }
}
```

```sh
pwd # ~
nr dev
```

Перейдите на сервер разработки, который запустился с этой командой. Если отображается сообщение, то настройка завершена.

![hello chibivue](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/hello_chibivue.png)

Исходный код до этого момента: \
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls//00_introduction/010_project_setup) 