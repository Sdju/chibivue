# Включаем рендеринг HTML-элементов

## Что такое функция h?

До сих пор мы заставили работать следующий исходный код:

```ts
import { createApp } from 'vue'

const app = createApp({
  render() {
    return 'Hello world.'
  },
})

app.mount('#app')
```

Это функция, которая просто отображает "Hello World." на экране.  
Поскольку с одним сообщением немного одиноко, давайте подумаем об интерфейсе разработчика, который также может отображать HTML-элементы.  
Вот где пригодится `функция h`. Это `h` означает `hyperscript` и предоставляется как функция для написания HTML (Hyper Text Markup Language) в JavaScript.

> h() - это сокращение от hyperscript, что означает "JavaScript, который создает HTML (язык гипертекстовой разметки)". Это название унаследовано от соглашений, принятых во многих реализациях Virtual DOM. Более описательным названием могло бы быть createVnode(), но более короткое название помогает, когда вам приходится вызывать эту функцию много раз в функции рендеринга.

Цитата: https://vuejs.org/guide/extras/render-function.html#creating-vnodes

Давайте посмотрим на функцию h в Vue.js.

```ts
import { createApp, h } from 'vue'

const app = createApp({
  render() {
    return h('div', {}, [
      h('p', {}, ['HelloWorld']),
      h('button', {}, ['click me!']),
    ])
  },
})

app.mount('#app')
```

В базовом использовании функции h вы указываете имя тега в качестве первого аргумента, атрибуты в качестве второго аргумента и массив дочерних элементов в качестве третьего аргумента.  
Здесь я особо упомянул "базовое использование", потому что функция h на самом деле имеет несколько синтаксисов для своих аргументов, и вы можете опустить второй аргумент или не использовать массив для дочерних элементов.  
Однако здесь мы реализуем ее в самом базовом синтаксисе.

## Как мы должны ее реализовать? 🤔

Теперь, когда мы понимаем интерфейс разработчика, давайте решим, как его реализовать.  
Важно отметить, как он используется в качестве возвращаемого значения функции рендеринга.  
Это означает, что функция `h` возвращает какой-то объект и использует этот результат внутренне.\
Поскольку сложно понять с сложными дочерними элементами, давайте рассмотрим результат реализации простой функции h.

```ts
const result = h('div', { class: 'container' }, ['hello'])
```

Какой результат должен быть сохранен в `result`? (Как мы должны форматировать результат и как мы должны его отобразить?)

Давайте предположим, что в `result` хранится следующий объект:

```ts
const result = {
  type: 'div',
  props: { class: 'container' },
  children: ['hello'],
}
```

Другими словами, мы получим объект, подобный приведенному выше, из функции рендеринга и используем его для выполнения операций DOM и отображения.\
Картина выглядит так (внутри `mount` функции `createApp`):

```ts
const app: App = {
  mount(rootContainer: HostElement) {
    const node = rootComponent.render!()
    render(node, rootContainer)
  },
}
```

Что ж, единственное, что изменилось, - это то, что мы изменили строку `message` на объект `node`.  
Все, что нам теперь нужно сделать, - это выполнить операции DOM на основе объекта в функции рендеринга.

На самом деле, этот объект имеет название, "Virtual DOM".  
Мы более подробно объясним о Virtual DOM в главе о Virtual DOM, так что пока просто запомните название.\

## Реализация функции h

Сначала создадим необходимые файлы.

```sh
pwd # ~
touch packages/runtime-core/vnode.ts
touch packages/runtime-core/h.ts
```

Определим типы в vnode.ts. Это все, что мы сделаем в vnode.ts.

```ts
export interface VNode {
  type: string
  props: VNodeProps
  children: (VNode | string)[]
}

export interface VNodeProps {
  [key: string]: any
}
```

Далее реализуем тело функции в h.ts.

```ts
export function h(
  type: string,
  props: VNodeProps,
  children: (VNode | string)[],
) {
  return { type, props, children }
}
```

Пока что давайте попробуем использовать функцию h в playground.

```ts
import { createApp, h } from 'chibivue'

const app = createApp({
  render() {
    return h('div', {}, ['Hello world.'])
  },
})

app.mount('#app')
```

Отображение на экране не работает, но если вы добавите лог в apiCreateApp, вы увидите, что он работает, как ожидалось.

```ts
mount(rootContainer: HostElement) {
  const vnode = rootComponent.render!();
  console.log(vnode); // Проверяем лог
  render(vnode, rootContainer);
},
```

Теперь давайте реализуем функцию рендеринга.\
Реализуем `createElement`, `createText` и `insert` в RendererOptions.

```ts
export interface RendererOptions<HostNode = RendererNode> {
  createElement(type: string): HostNode // Добавлено

  createText(text: string): HostNode // Добавлено

  setElementText(node: HostNode, text: string): void

  insert(child: HostNode, parent: HostNode, anchor?: HostNode | null): void // Добавлено
}
```

Реализуем функцию `renderVNode` в функции рендеринга. Пока мы игнорируем `props`.

```ts
export function createRenderer(options: RendererOptions) {
  const {
    createElement: hostCreateElement,
    createText: hostCreateText,
    insert: hostInsert,
  } = options

  function renderVNode(vnode: VNode | string) {
    if (typeof vnode === 'string') return hostCreateText(vnode)
    const el = hostCreateElement(vnode.type)

    for (const child of vnode.children) {
      const childEl = renderVNode(child)
      hostInsert(childEl, el)
    }

    return el
  }

  const render: RootRenderFunction = (vnode, container) => {
    const el = renderVNode(vnode)
    hostInsert(el, container)
  }

  return { render }
}
```

В nodeOps runtime-dom определим фактические операции DOM.

```ts
export const nodeOps: RendererOptions<Node> = {
  // Добавлено
  createElement: tagName => {
    return document.createElement(tagName)
  },

  // Добавлено
  createText: (text: string) => {
    return document.createTextNode(text)
  },

  setElementText(node, text) {
    node.textContent = text
  },

  // Добавлено
  insert: (child, parent, anchor) => {
    parent.insertBefore(child, anchor || null)
  },
}
```

Ну, на этом этапе вы должны быть в состоянии отображать элементы на экране.\
Попробуйте написать и протестировать различные вещи в playground!

```ts
import { createApp, h } from 'chibivue'

const app = createApp({
  render() {
    return h('div', {}, [
      h('p', {}, ['Hello world.']),
      h('button', {}, ['click me!']),
    ])
  },
})

app.mount('#app')
```

Ура! Теперь мы можем использовать функцию h для отображения различных тегов!

![](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/simple_h_function.png)

Исходный код до этого момента: \
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/10_minimum_example/020_simple_h_function)
