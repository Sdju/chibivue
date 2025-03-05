# Пропсы компонентов

## Интерфейс разработчика

Давайте начнем с пропсов.\
Подумаем о конечном интерфейсе разработчика.\
Рассмотрим, что пропсы передаются в качестве первого аргумента функции `setup`.

```ts
const MyComponent = {
  props: { message: { type: String } },

  setup(props) {
    return () => h('div', { id: 'my-app' }, [`message: ${props.message}`])
  },
}

const app = createApp({
  setup() {
    const state = reactive({ message: 'hello' })

    const changeMessage = () => {
      state.message += '!'
    }

    return () =>
      h('div', { id: 'my-app' }, [
        h(MyComponent, { message: state.message }, []),
      ])
  },
})
```

## Реализация

Исходя из этого, давайте подумаем о информации, которую мы хотим иметь в `ComponentInternalInstance`.\
Нам нужно определение пропсов, указанное как `props: { message: { type: String } }`, и свойство для фактического хранения значения пропсов, поэтому добавим следующее:

```ts
export type Data = Record<string, unknown>

export interface ComponentInternalInstance {
  // .
  // .
  // .
  propsOptions: Props // Хранит объект вроде `props: { message: { type: String } }`

  props: Data // Хранит фактические данные, переданные от родителя (в данном случае, это будет что-то вроде `{ message: "hello" }`)
}
```

Создайте новый файл `~/packages/runtime-core/componentProps.ts` со следующим содержимым:

```ts
export type Props = Record<string, PropOptions | null>

export interface PropOptions<T = any> {
  type?: PropType<T> | true | null
  required?: boolean
  default?: null | undefined | object
}

export type PropType<T> = { new (...args: any[]): T & {} }
```

Добавьте его в опции при реализации компонента.

```ts
export type ComponentOptions = {
  props?: Record<string, any> // Добавлено
  setup?: () => Function
  render?: Function
}
```

При генерации экземпляра с помощью `createComponentInstance`, установите propsOptions в экземпляр при генерации экземпляра.

```ts
export function createComponentInstance(
  vnode: VNode
): ComponentInternalInstance {
  const type = vnode.type as Component;

  const instance: ComponentInternalInstance = {
    // .
    // .
    // .
    propsOptions: type.props || {},
    props: {},
```

Давайте подумаем о том, как формировать `instance.props`.\
Во время монтирования компонента отфильтруйте пропсы, хранящиеся в vnode, на основе propsOptions.\
Преобразуйте отфильтрованный объект в реактивный объект, используя функцию `reactive`, и присвойте его `instance.props`.

Реализуйте функцию `initProps` в `componentProps.ts`, которая выполняет эту серию шагов.

```ts
export function initProps(
  instance: ComponentInternalInstance,
  rawProps: Data | null,
) {
  const props: Data = {}
  setFullProps(instance, rawProps, props)
  instance.props = reactive(props)
}

function setFullProps(
  instance: ComponentInternalInstance,
  rawProps: Data | null,
  props: Data,
) {
  const options = instance.propsOptions

  if (rawProps) {
    for (let key in rawProps) {
      const value = rawProps[key]
      if (options && options.hasOwnProperty(key)) {
        props[key] = value
      }
    }
  }
}
```

Фактически выполните `initProps` во время монтирования и передайте пропсы в функцию `setup` в качестве аргумента.

```ts
const mountComponent = (initialVNode: VNode, container: RendererElement) => {
    const instance: ComponentInternalInstance = (initialVNode.component =
      createComponentInstance(initialVNode));

    // инициализация пропсов
    const { props } = instance.vnode;
    initProps(instance, props);

    const component = initialVNode.type as Component;
    if (component.setup) {
      instance.render = component.setup(
        instance.props // Передаем пропсы в setup
      ) as InternalRenderFunction;
    }
    // .
    // .
    // .
}
```

```ts
export type ComponentOptions = {
  props?: Record<string, any>
  setup?: (props: Record<string, any>) => Function // Получаем пропсы
  render?: Function
}
```

На данный момент пропсы должны передаваться дочернему компоненту, так что давайте проверим это в playground.

```ts
const MyComponent = {
  props: { message: { type: String } },

  setup(props: { message: string }) {
    return () => h('div', { id: 'my-app' }, [`message: ${props.message}`])
  },
}

const app = createApp({
  setup() {
    const state = reactive({ message: 'hello' })

    return () =>
      h('div', { id: 'my-app' }, [
        h(MyComponent, { message: state.message }, []),
      ])
  },
})
```

Однако этого недостаточно, так как рендеринг не обновляется при изменении пропсов.

```ts
const MyComponent = {
  props: { message: { type: String } },

  setup(props: { message: string }) {
    return () => h('div', { id: 'my-app' }, [`message: ${props.message}`])
  },
}

const app = createApp({
  setup() {
    const state = reactive({ message: 'hello' })
    const changeMessage = () => {
      state.message += '!'
    }

    return () =>
      h('div', { id: 'my-app' }, [
        h(MyComponent, { message: state.message }, []),
        h('button', { onClick: changeMessage }, ['change message']),
      ])
  },
})
```

Чтобы этот компонент работал, нам нужно реализовать `updateProps` в `componentProps.ts` и выполнить его при обновлении компонента.

`~/packages/runtime-core/componentProps.ts`

```ts
export function updateProps(
  instance: ComponentInternalInstance,
  rawProps: Data | null,
) {
  const { props } = instance
  Object.assign(props, rawProps)
}
```

`~/packages/runtime-core/renderer.ts`

```ts
const setupRenderEffect = (
    instance: ComponentInternalInstance,
    initialVNode: VNode,
    container: RendererElement
  ) => {
    const componentUpdateFn = () => {
      const { render } = instance;
      if (!instance.isMounted) {
        const subTree = (instance.subTree = normalizeVNode(render()));
        patch(null, subTree, container);
        initialVNode.el = subTree.el;
        instance.isMounted = true;
      } else {
        let { next, vnode } = instance;

        if (next) {
          next.el = vnode.el;
          next.component = instance;
          instance.vnode = next;
          instance.next = null;
          updateProps(instance, next.props); // здесь
```

Если экран обновляется, всё в порядке.\
Теперь вы можете передавать данные компоненту, используя пропсы! Отличная работа!

![props](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/props.png)

Исходный код до этого момента:  
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/10_minimum_example/050_component_system2)

В качестве примечания, хотя это не обязательно, давайте реализуем возможность получать пропсы в kebab-case, как в оригинальном Vue.\
На данный момент создайте директорию `~/packages/shared` и создайте в ней файл `general.ts`.\
Это место для определения общих функций, не только для `runtime-core` и `runtime-dom`.\
Следуя оригинальному Vue, давайте реализуем `hasOwn` и `camelize`.

`~/packages/shared/general.ts`

```ts
const hasOwnProperty = Object.prototype.hasOwnProperty
export const hasOwn = (
  val: object,
  key: string | symbol,
): key is keyof typeof val => hasOwnProperty.call(val, key)

const camelizeRE = /-(\w)/g
export const camelize = (str: string): string => {
  return str.replace(camelizeRE, (_, c) => (c ? c.toUpperCase() : ''))
}
```

Давайте использовать `camelize` в `componentProps.ts`.

```ts
export function updateProps(
  instance: ComponentInternalInstance,
  rawProps: Data | null,
) {
  const { props } = instance
  // -------------------------------------------------------------- здесь
  Object.entries(rawProps ?? {}).forEach(([key, value]) => {
    props[camelize(key)] = value
  })
}

function setFullProps(
  instance: ComponentInternalInstance,
  rawProps: Data | null,
  props: Data,
) {
  const options = instance.propsOptions

  if (rawProps) {
    for (let key in rawProps) {
      const value = rawProps[key]
      // -------------------------------------------------------------- здесь
      // kebab -> camel
      let camelKey
      if (options && hasOwn(options, (camelKey = camelize(key)))) {
        props[camelKey] = value
      }
    }
  }
}
```

Теперь вы должны иметь возможность обрабатывать kebab-case. Давайте проверим это в playground.

```ts
const MyComponent = {
  props: { someMessage: { type: String } },

  setup(props: { someMessage: string }) {
    return () => h('div', {}, [`someMessage: ${props.someMessage}`])
  },
}

const app = createApp({
  setup() {
    const state = reactive({ message: 'hello' })
    const changeMessage = () => {
      state.message += '!'
    }

    return () =>
      h('div', { id: 'my-app' }, [
        h(MyComponent, { 'some-message': state.message }, []),
        h('button', { onClick: changeMessage }, ['change message']),
      ])
  },
})
```