# Архитектура пакетов

## Рефакторинг

Вы можете подумать: "Что? Мы реализовали так мало, а вы уже хотите рефакторить?" Но одна из целей этой книги - "научиться читать исходный код Vue.js".

Учитывая это, я хочу всегда учитывать структуру файлов и директорий в стиле Vue.js. Поэтому, пожалуйста, позвольте мне сделать небольшой рефакторинг...

### Дизайн Vue.js

#### runtime-core и runtime-dom

Позвольте мне немного объяснить структуру официального Vue.js. В этом рефакторинге мы создадим две директории: "runtime-core" и "runtime-dom".

Чтобы объяснить, что каждая из них представляет, "runtime-core" содержит основную функциональность среды выполнения Vue.js. На данном этапе может быть сложно понять, что является основным, а что нет.

Поэтому я думаю, что будет проще понять, рассмотрев отношения с "runtime-dom". Как следует из названия, "runtime-dom" - это директория, которая содержит реализации, зависящие от DOM. Грубо говоря, это можно понимать как "операции, зависящие от браузера". Это включает в себя операции DOM, такие как querySelector и createElement.

В runtime-core мы не пишем такие операции, а вместо этого проектируем его так, чтобы описать основную логику среды выполнения Vue.js в мире чистого TypeScript. Например, это включает реализации, связанные с Virtual DOM и компонентами. Думаю, это станет яснее по мере разработки chibivue, поэтому если вы не понимаете, пожалуйста, просто следуйте рефакторингу, как описано в книге.

#### Роли и зависимости каждого файла

Теперь мы создадим несколько файлов в runtime-core и runtime-dom. Необходимые файлы следующие:

```sh
pwd # ~
mkdir packages/runtime-core
mkdir packages/runtime-dom

## core
touch packages/runtime-core/index.ts
touch packages/runtime-core/apiCreateApp.ts
touch packages/runtime-core/component.ts
touch packages/runtime-core/componentOptions.ts
touch packages/runtime-core/renderer.ts

## dom
touch packages/runtime-dom/index.ts
touch packages/runtime-dom/nodeOps.ts
```

Что касается ролей этих файлов, может быть сложно понять только по объяснению словами, поэтому обратитесь к следующей диаграмме:

![refactor_createApp!](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/refactor_createApp.png)

#### Дизайн рендерера

Как упоминалось ранее, Vue.js отделяет части, зависящие от DOM, от чистой основной функциональности Vue.js. В первую очередь я хочу, чтобы вы обратили внимание на фабрику рендерера в "runtime-core" и nodeOps в "runtime-dom". В примере, который мы реализовали ранее, мы напрямую рендерили в методе mount приложения, возвращаемого createApp.

```ts
// Это код из прошлого примера
export const createApp = (options: Options): App => {
  return {
    mount: selector => {
      const root = document.querySelector(selector)
      if (root) {
        root.innerHTML = options.render() // Рендеринг
      }
    },
  }
}
```

На данный момент код короткий и совсем не сложный, поэтому на первый взгляд кажется нормальным. Однако он станет гораздо сложнее, когда мы будем писать логику патч-рендеринга для Virtual DOM в будущем. В Vue.js эта часть, отвечающая за рендеринг, выделена как "renderer". Это "runtime-core/renderer.ts". Когда речь идет о рендеринге, легко представить, что он зависит от API (document), который управляет DOM в браузере в SPA (создание элементов, установка текста и т.д.). Поэтому, чтобы отделить эту часть, зависящую от DOM, от основной логики рендеринга Vue.js, были сделаны некоторые приемы. Вот как это работает:

- Реализовать объект в `runtime-dom/nodeOps` для операций с DOM.
- Реализовать фабричную функцию в `runtime-core/renderer`, которая генерирует объект, содержащий только логику для рендеринга. При этом необходимо передать объект, обрабатывающий узлы (не ограничиваясь DOM), в качестве аргумента фабричной функции.
- Использовать фабрики для `nodeOps` и `renderer` в `runtime-dom/index.ts` для завершения рендерера.

Это часть, выделенная красным на диаграмме.
![refactor_createApp_render](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/refactor_createApp_render.png)

Позвольте мне объяснить исходный код. На данный момент функция рендеринга Virtual DOM еще не реализована, поэтому мы создадим ее с той же функциональностью, что и раньше.

Сначала реализуем интерфейс для объекта, используемого для операций с узлами (не ограничиваясь DOM) в `runtime-core/renderer`.

```ts
export interface RendererOptions<HostNode = RendererNode> {
  setElementText(node: HostNode, text: string): void
}

export interface RendererNode {
  [key: string]: any
}

export interface RendererElement extends RendererNode {}
```

В настоящее время есть только функция `setElementText`, но вы можете представить, что в будущем будут реализованы такие функции, как `createElement` и `removeChild`.

Что касается `RendererNode` и `RendererElement`, пока что игнорируйте их. (Здесь реализация просто определяет общий тип для объектов, которые становятся узлами, без зависимости от DOM.)  
Реализуйте фабричную функцию рендерера в этом файле, которая принимает `RendererOptions` в качестве аргумента.

```ts
export type RootRenderFunction<HostElement = RendererElement> = (
  message: string,
  container: HostElement,
) => void

export function createRenderer(options: RendererOptions) {
  const { setElementText: hostSetElementText } = options

  const render: RootRenderFunction = (message, container) => {
    hostSetElementText(container, message) // В данном случае мы просто вставляем сообщение, поэтому реализация такая
  }

  return { render }
}
```

Далее реализуем `nodeOps` в `runtime-dom/nodeOps`.

```ts
import { RendererOptions } from '../runtime-core'

export const nodeOps: RendererOptions<Node> = {
  setElementText(node, text) {
    node.textContent = text
  },
}
```

Здесь нет ничего особенно сложного.

Теперь давайте завершим рендерер в `runtime-dom/index.ts`.

```ts
import { createRenderer } from '../runtime-core'
import { nodeOps } from './nodeOps'

const { render } = createRenderer(nodeOps)
```

С этим рефакторинг рендерера завершен.

#### DI и DIP

Давайте рассмотрим дизайн рендерера. Подводя итог:

- Реализуем фабричную функцию в `runtime-core/renderer` для генерации рендерера.
- Реализуем объект в `runtime-dom/nodeOps` для операций (манипуляций), зависящих от DOM.
- Объединяем фабричную функцию и `nodeOps` в `runtime-dom/index` для генерации рендерера.

Это концепции "DIP" и "DI". Сначала поговорим о DIP (принцип инверсии зависимостей). Реализуя интерфейс, мы можем инвертировать зависимость. На что следует обратить внимание, так это на интерфейс `RendererOptions`, реализованный в `renderer.ts`. И фабричная функция, и `nodeOps` должны соответствовать этому интерфейсу `RendererOptions` (зависеть от интерфейса `RendererOptions`). Используя это, мы выполняем DI. Внедрение зависимостей (DI) - это техника, которая уменьшает зависимость путем внедрения объекта, от которого зависит объект, извне. В данном случае рендерер зависит от объекта, реализующего `RendererOptions` (в данном случае `nodeOps`). Вместо того, чтобы реализовывать эту зависимость напрямую из рендерера, мы получаем ее как аргумент для фабрики. Используя эти техники, мы гарантируем, что рендерер не зависит от DOM.

DI и DIP могут быть сложными концепциями, если вы не знакомы с ними, но это важные техники, которые часто используются, поэтому я надеюсь, что вы можете исследовать и понять их самостоятельно.

### Завершение createApp

Теперь вернемся к реализации. Теперь, когда рендерер был сгенерирован, все, что нам нужно сделать, это рассмотреть красную область на следующей диаграмме.

![refactor_createApp_createApp](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/refactor_createApp_createApp.png)

Однако это простая задача. Нам просто нужно реализовать фабричную функцию для createApp, чтобы она могла принимать рендерер, который мы создали ранее.

```ts
// ~/packages/runtime-core apiCreateApp.ts

import { Component } from './component'
import { RootRenderFunction } from './renderer'

export interface App<HostElement = any> {
  mount(rootContainer: HostElement | string): void
}

export type CreateAppFunction<HostElement> = (
  rootComponent: Component,
) => App<HostElement>

export function createAppAPI<HostElement>(
  render: RootRenderFunction<HostElement>,
): CreateAppFunction<HostElement> {
  return function createApp(rootComponent) {
    const app: App = {
      mount(rootContainer: HostElement) {
        const message = rootComponent.render!()
        render(message, rootContainer)
      },
    }

    return app
  }
}
```

```ts
// ~/packages/runtime-dom/index.ts

import {
  CreateAppFunction,
  createAppAPI,
  createRenderer,
} from '../runtime-core'
import { nodeOps } from './nodeOps'

const { render } = createRenderer(nodeOps)
const _createApp = createAppAPI(render)

export const createApp = ((...args) => {
  const app = _createApp(...args)
  const { mount } = app
  app.mount = (selector: string) => {
    const container = document.querySelector(selector)
    if (!container) return
    mount(container)
  }

  return app
}) as CreateAppFunction<Element>
```

Я переместил типы в `~/packages/runtime-core/component.ts`, но это не важно, поэтому, пожалуйста, обратитесь к исходному коду (это просто приведение в соответствие с оригинальным Vue.js).

Теперь, когда мы ближе к исходному коду оригинального Vue.js, давайте протестируем его. Если сообщение все еще отображается, все в порядке.

Исходный код до этого момента:  
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/10_minimum_example/015_package_architecture)
