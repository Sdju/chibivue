# Стремление к компонентно-ориентированной разработке

## Размышления на основе организации существующих реализаций

До сих пор мы реализовали API createApp, систему реактивности и систему Virtual DOM в небольшом масштабе.\
С текущей реализацией мы можем динамически изменять пользовательский интерфейс с помощью системы реактивности и выполнять эффективный рендеринг с помощью системы Virtual DOM. \
Однако, как интерфейс разработчика, всё написано в createAppAPI.\
На самом деле, я хочу больше разделить файлы и реализовать общие компоненты для повторного использования.\
Сначала давайте рассмотрим части, которые в настоящее время являются беспорядочными в существующей реализации. Пожалуйста, взгляните на функцию render в renderer.ts.

```ts
const render: RootRenderFunction = (rootComponent, container) => {
  const componentRender = rootComponent.setup!()

  let n1: VNode | null = null
  let n2: VNode = null!

  const updateComponent = () => {
    const n2 = componentRender()
    patch(n1, n2, container)
    n1 = n2
  }

  const effect = new ReactiveEffect(updateComponent)
  effect.run()
}
```

В функции render информация о корневом компоненте определена напрямую.\
На самом деле, n1, n2, updateComponent и effect существуют для каждого компонента.\
Фактически, с этого момента я хочу определить компонент (в некотором смысле, конструктор) на стороне пользователя и создать его экземпляр.\
И я хочу, чтобы экземпляр имел такие свойства, как n1, n2 и updateComponent.\
Итак, давайте подумаем об инкапсуляции их как экземпляра компонента.

Давайте определим что-то под названием `ComponentInternalInstance` в `~/packages/runtime-core/component.ts`. \
Это будет тип экземпляра.

```ts
export interface ComponentInternalInstance {
  type: Component // Исходный компонент, определенный пользователем (старый rootComponent (на самом деле не только корневой компонент))
  vnode: VNode // Будет объяснено позже
  subTree: VNode // Старый n1
  next: VNode | null // Старый n2
  effect: ReactiveEffect // Старый effect
  render: InternalRenderFunction // Старый componentRender
  update: () => void // Старый updateComponent
  isMounted: boolean
}

export type InternalRenderFunction = {
  (): VNodeChild
}
```

Свойства vnode, subTree и next, которые имеет этот экземпляр, немного сложны, но с этого момента мы будем реализовывать так, чтобы ConcreteComponent можно было указать как тип VNode.\
В instance.vnode мы будем хранить сам VNode.\
А subTree и next будут хранить результат рендеринга VNode этого компонента. (Это то же самое, что и раньше с n1 и n2)

В плане образа,

```ts
const MyComponent = {
  setup() {
    return h('p', {}, ['hello'])
  },
}

const App = {
  setup() {
    return h(MyComponent, {}, [])
  },
}
```

Вы можете использовать это так, и если вы позволите экземпляру быть экземпляром MyComponent, instance.vnode будет хранить результат `h(MyComponent, {}, [])`, а instance.subTree будет хранить результат `h("p", {}, ["hello"])`.

Пока что давайте реализуем так, чтобы вы могли указать компонент в качестве первого аргумента функции h.\
Однако, это просто вопрос получения объекта, который определяет компонент как тип.\
В `~/packages/runtime-core/vnode.ts`

```ts
export type VNodeTypes = string | typeof Text | object // Добавить object;
```

В `~/packages/runtime-core/h.ts`

```ts
export function h(
  type: string | object, // Добавить object
  props: VNodeProps
) {..}
```

Давайте также убедимся, что VNode имеет экземпляр компонента.

```ts
export interface VNode<HostNode = any> {
  // .
  // .
  // .
  component: ComponentInternalInstance | null // Добавить
}
```

В результате рендерер также должен обрабатывать компоненты. \
Реализуйте `processComponent` аналогично `processElement` и `processText` для обработки компонентов, а также реализуйте `mountComponent` и `patchComponent` (или `updateComponent`).

Сначала давайте начнем с обзора и подробного объяснения.

```ts
const patch = (n1: VNode | null, n2: VNode, container: RendererElement) => {
  const { type } = n2
  if (type === Text) {
    processText(n1, n2, container)
  } else if (typeof type === 'string') {
    processElement(n1, n2, container)
  } else if (typeof type === 'object') {
    // Добавить ветвление
    processComponent(n1, n2, container)
  } else {
    // ничего не делать
  }
}

const processComponent = (
  n1: VNode | null,
  n2: VNode,
  container: RendererElement,
) => {
  if (n1 == null) {
    mountComponent(n2, container)
  } else {
    updateComponent(n1, n2)
  }
}

const mountComponent = (initialVNode: VNode, container: RendererElement) => {
  // TODO:
}

const updateComponent = (n1: VNode, n2: VNode) => {
  // TODO:
}
```

Теперь давайте рассмотрим `mountComponent`. Есть три вещи, которые нужно сделать.

1. Создать экземпляр компонента.
2. Выполнить функцию `setup` и сохранить результат в экземпляре.
3. Создать `ReactiveEffect` и сохранить его в экземпляре.

Сначала давайте реализуем функцию в `component.ts` для создания экземпляра компонента (аналогично конструктору).

```ts
export function createComponentInstance(
  vnode: VNode,
): ComponentInternalInstance {
  const type = vnode.type as Component

  const instance: ComponentInternalInstance = {
    type,
    vnode,
    next: null,
    effect: null!,
    subTree: null!,
    update: null!,
    render: null!,
    isMounted: false,
  }

  return instance
}
```

Хотя тип каждого свойства не является null, мы инициализируем их значением null при создании экземпляра (следуя дизайну оригинального Vue.js).

```ts
const mountComponent = (initialVNode: VNode, container: RendererElement) => {
  const instance: ComponentInternalInstance = (initialVNode.component =
    createComponentInstance(initialVNode))
  // TODO: настройка компонента
  // TODO: настройка эффекта
}
```

Далее идет функция `setup`. \
Нам нужно переместить код, который ранее был написан непосредственно в функции `render`, сюда и сохранить результат в экземпляре вместо использования переменных.

```ts
const mountComponent = (initialVNode: VNode, container: RendererElement) => {
  const instance: ComponentInternalInstance = (initialVNode.component =
    createComponentInstance(initialVNode))

  const component = initialVNode.type as Component
  if (component.setup) {
    instance.render = component.setup() as InternalRenderFunction
  }

  // TODO: настройка эффекта
}
```

Наконец, давайте объединим код для создания эффекта в функцию под названием `setupRenderEffect`. \
Опять же, основная задача - переместить код, который ранее был реализован непосредственно в функции `render`, сюда, используя состояние экземпляра.

```ts
const mountComponent = (initialVNode: VNode, container: RendererElement) => {
  const instance: ComponentInternalInstance = (initialVNode.component =
    createComponentInstance(initialVNode))

  const component = initialVNode.type as Component
  if (component.setup) {
    instance.render = component.setup() as InternalRenderFunction
  }

  setupRenderEffect(instance, initialVNode, container)
}

const setupRenderEffect = (
  instance: ComponentInternalInstance,
  initialVNode: VNode,
  container: RendererElement,
) => {
  const componentUpdateFn = () => {
    const { render } = instance

    if (!instance.isMounted) {
      // процесс монтирования
      const subTree = (instance.subTree = normalizeVNode(render()))
      patch(null, subTree, container)
      initialVNode.el = subTree.el
      instance.isMounted = true
    } else {
      // процесс патча
      let { next, vnode } = instance

      if (next) {
        next.el = vnode.el
        next.component = instance
        instance.vnode = next
        instance.next = null
      } else {
        next = vnode
      }

      const prevTree = instance.subTree
      const nextTree = normalizeVNode(render())
      instance.subTree = nextTree

      patch(prevTree, nextTree, hostParentNode(prevTree.el!)!) // ※ 1
      next.el = nextTree.el
    }
  }

  const effect = (instance.effect = new ReactiveEffect(componentUpdateFn))
  const update = (instance.update = () => effect.run()) // Регистрация в instance.update
  update()
}
```

※ 1: Пожалуйста, реализуйте функцию под названием `parentNode` в `nodeOps`, которая извлекает родительский узел.

```ts
parentNode: (node) => {
    return node.parentNode;
},
```

Я думаю, что это не особенно сложно, хотя и немного длинно.\
В функции `setupRenderEffect` функция для обновления регистрируется как метод `update` экземпляра, поэтому в `updateComponent` нам просто нужно вызвать эту функцию.

```ts
const updateComponent = (n1: VNode, n2: VNode) => {
  const instance = (n2.component = n1.component)!
  instance.next = n2
  instance.update()
}
```

Наконец, поскольку реализация, которая была определена в функции `render` до сих пор, больше не нужна, мы удалим ее.

```ts
const render: RootRenderFunction = (rootComponent, container) => {
  const vnode = createVNode(rootComponent, {}, [])
  patch(null, vnode, container)
}
```

Теперь мы можем рендерить компоненты. Давайте попробуем создать компонент `playground` в качестве примера.\
Таким образом, мы можем разделить рендеринг на компоненты.

```ts
import { createApp, h, reactive } from 'chibivue'

const CounterComponent = {
  setup() {
    const state = reactive({ count: 0 })
    const increment = () => state.count++

    return () =>
      h('div', {}, [
        h('p', {}, [`count: ${state.count}`]),
        h('button', { onClick: increment }, ['increment']),
      ])
  },
}

const app = createApp({
  setup() {
    return () =>
      h('div', { id: 'my-app' }, [
        h(CounterComponent, {}, []),
        h(CounterComponent, {}, []),
        h(CounterComponent, {}, []),
      ])
  },
})

app.mount('#app')
```

Исходный код до этого момента:
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/10_minimum_example/050_component_system)
