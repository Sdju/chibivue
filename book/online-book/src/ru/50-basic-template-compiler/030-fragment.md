# Реализация Fragment

## Проблемы с текущей реализацией

Давайте попробуем запустить следующий код в playground:

```ts
import { createApp, defineComponent } from 'chibivue'

const App = defineComponent({
  template: `<header>header</header>
<main>main</main>
<footer>footer</footer>`,
})

const app = createApp(App)

app.mount('#app')
```

Вы можете столкнуться с ошибкой, подобной этой:

![fragment_error.png](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/fragment_error.png)

Глядя на сообщение об ошибке, похоже, что это связано с конструктором Function.

Другими словами, генерация кода, кажется, успешна до определенного момента, поэтому давайте посмотрим, какой код фактически генерируется.

```ts
return function render(_ctx) {
  with (_ctx) {
    const { createVNode: _createVNode } = ChibiVue

    return _createVNode("header", null, "header")"\n  "_createVNode("main", null, "main")"\n  "_createVNode("footer", null, "footer")
   }
}
```

Код после оператора `return` неверен. Текущая реализация генерации кода не обрабатывает случаи, когда корень является массивом (т.е. не одиночным узлом).

Мы исправим эту проблему.

## Какой код должен быть сгенерирован?

Даже при внесении изменений, какой код должен быть сгенерирован?

В итоге код должен выглядеть так:

```ts
return function render(_ctx) {
  with (_ctx) {
    const { createVNode: _createVNode, Fragment: _Fragment } = ChibiVue

    return _createVNode(_Fragment, null, [
      [
        _createVNode('header', null, 'header'),
        '\n  ',
        _createVNode('main', null, 'main'),
        '\n  ',
        _createVNode('footer', null, 'footer'),
      ],
    ])
  }
}
```

Этот `Fragment` - это символ, определенный в Vue.

Другими словами, Fragment не представлен как AST, подобный FragmentNode, а просто как тег ElementNode.

Мы реализуем обработку для Fragment в рендерере, аналогично Text.

## Реализация

Fragment символ будет реализован в runtime-core/vnode.ts.

Давайте добавим его как новый тип в VNodeTypes.

```ts
export type VNodeTypes = Component | typeof Text | typeof Fragment | string

export const Fragment = Symbol()
```

Реализуем рендерер.

Добавим ветвь для fragment в функции patch.

```ts
if (type === Text) {
  processText(n1, n2, container, anchor)
} else if (shapeFlag & ShapeFlags.ELEMENT) {
  processElement(n1, n2, container, anchor, parentComponent)
} else if (type === Fragment) {
  // Здесь
  processFragment(n1, n2, container, anchor, parentComponent)
} else if (shapeFlag & ShapeFlags.COMPONENT) {
  processComponent(n1, n2, container, anchor, parentComponent)
} else {
  // ничего не делаем
}
```

Обратите внимание, что вставка или удаление элементов обычно должны быть реализованы с anchor в качестве маркера.

Как следует из названия, anchor указывает на начальную и конечную позиции фрагмента.

Начальный элемент представлен существующим свойством `el` в VNode, но в настоящее время нет свойства для представления конца. Давайте добавим его.

```ts
export interface VNode<HostNode = any> {
  // .
  // .
  // .
  anchor: HostNode | null // fragment anchor // Добавлено
  // .
  // .
}
```

Установим anchor во время монтирования.

Передадим конец фрагмента как anchor в mount/patch.

```ts
const processFragment = (
  n1: VNode | null,
  n2: VNode,
  container: RendererElement,
  anchor: RendererNode | null,
  parentComponent: ComponentInternalInstance | null,
) => {
  const fragmentStartAnchor = (n2.el = n1 ? n1.el : hostCreateText(''))!
  const fragmentEndAnchor = (n2.anchor = n1 ? n1.anchor : hostCreateText(''))!

  if (n1 == null) {
    hostInsert(fragmentStartAnchor, container, anchor)
    hostInsert(fragmentEndAnchor, container, anchor)
    mountChildren(
      n2.children as VNode[],
      container,
      fragmentEndAnchor,
      parentComponent,
    )
  } else {
    patchChildren(n1, n2, container, fragmentEndAnchor, parentComponent)
  }
}
```

Будьте осторожны, когда элементы фрагмента изменяются во время обновлений.

```ts
const move = (
  vnode: VNode,
  container: RendererElement,
  anchor: RendererElement | null,
) => {
  const { type, children, el, shapeFlag } = vnode

  // .

  if (type === Fragment) {
    hostInsert(el!, container, anchor)
    for (let i = 0; i < (children as VNode[]).length; i++) {
      move((children as VNode[])[i], container, anchor)
    }
    hostInsert(vnode.anchor!, container, anchor) // Вставляем anchor
    return
  }
  // .
  // .
  // .
}
```

Во время размонтирования также полагаемся на anchor для удаления элементов.

```ts
const remove = (vnode: VNode) => {
  const { el, type, anchor } = vnode
  if (type === Fragment) {
    removeFragment(el!, anchor!)
  }

  // .
  // .
  // .
}

const removeFragment = (cur: RendererNode, end: RendererNode) => {
  let next
  while (cur !== end) {
    next = hostNextSibling(cur)! // ※ Добавьте это в nodeOps!
    hostRemove(cur)
    cur = next
  }
  hostRemove(end)
}
```

## Тестирование

Код, который мы написали ранее, должен работать правильно.

```ts
import { Fragment, createApp, defineComponent, h, ref } from 'chibivue'

const App = defineComponent({
  template: `<header>header</header>
<main>main</main>
<footer>footer</footer>`,
})

const app = createApp(App)

app.mount('#app')
```

В настоящее время мы не можем использовать директивы, такие как v-for, поэтому мы не можем написать описание, которое использует фрагмент в шаблоне и изменяет количество элементов.

Давайте симулируем поведение, написав скомпилированный код и посмотрим, как это работает.

```ts
import { Fragment, createApp, defineComponent, h, ref } from 'chibivue'

// const App = defineComponent({
//   template: `<header>header</header>
//   <main>main</main>
//   <footer>footer</footer>`,
// });

const App = defineComponent({
  setup() {
    const list = ref([0])
    const update = () => {
      list.value = [...list.value, list.value.length]
    }
    return () =>
      h(Fragment, {}, [
        h('button', { onClick: update }, 'update'),
        ...list.value.map(i => h('div', {}, i)),
      ])
  },
})

const app = createApp(App)

app.mount('#app')
```

Похоже, что все работает правильно!

Исходный код до этого момента: [GitHub](https://github.com/chibivue-land/chibivue/tree/main/book/impls/50_basic_template_compiler/030_fragment)
