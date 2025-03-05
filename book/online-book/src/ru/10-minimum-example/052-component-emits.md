# События компонентов (Emit)

## Интерфейс разработчика

Продолжая с пропсами, давайте реализуем события (emits).\
Реализация событий относительно проста, поэтому она будет завершена быстро.

С точки зрения интерфейса разработчика, события будут получены из второго аргумента функции setup.

```ts
const MyComponent: Component = {
  props: { someMessage: { type: String } },

  setup(props: any, { emit }: any) {
    return () =>
      h('div', {}, [
        h('p', {}, [`someMessage: ${props.someMessage}`]),
        h('button', { onClick: () => emit('click:change-message') }, [
          'change message',
        ]),
      ])
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
        h(
          MyComponent,
          {
            'some-message': state.message,
            'onClick:change-message': changeMessage,
          },
          [],
        ),
      ])
  },
})
```

## Реализация

Аналогично пропсам, давайте создадим файл `~/packages/runtime-core/componentEmits.ts` и реализуем его там.\
`~/packages/runtime-core/componentEmits.ts`

```ts
export function emit(
  instance: ComponentInternalInstance,
  event: string,
  ...rawArgs: any[]
) {
  const props = instance.vnode.props || {}
  let args = rawArgs

  let handler =
    props[toHandlerKey(event)] || props[toHandlerKey(camelize(event))]

  if (handler) handler(...args)
}
```

`~/packages/shared/general.ts`

```ts
export const capitalize = (str: string) =>
  str.charAt(0).toUpperCase() + str.slice(1)

export const toHandlerKey = (str: string) => (str ? `on${capitalize(str)}` : ``)
```

`~/packages/runtime-core/component.ts`

```ts
export interface ComponentInternalInstance {
  // .
  // .
  // .
  emit: (event: string, ...args: any[]) => void
}

export function createComponentInstance(
  vnode: VNode,
): ComponentInternalInstance {
  const type = vnode.type as Component

  const instance: ComponentInternalInstance = {
    // .
    // .
    // .
    emit: null!, // будет установлено немедленно
  }

  instance.emit = emit.bind(null, instance)
  return instance
}
```

Вы можете передать это в функцию setup.

`~/packages/runtime-core/componentOptions.ts`

```ts
export type ComponentOptions = {
  props?: Record<string, any>
  setup?: (
    props: Record<string, any>,
    ctx: { emit: (event: string, ...args: any[]) => void },
  ) => Function // Для получения ctx.emit
  render?: Function
}
```

```ts
const mountComponent = (initialVNode: VNode, container: RendererElement) => {
    const instance: ComponentInternalInstance = (initialVNode.component =
      createComponentInstance(initialVNode));

    const { props } = instance.vnode;
    initProps(instance, props);

    const component = initialVNode.type as Component;
    if (component.setup) {
      // Передаем emit
      instance.render = component.setup(instance.props, {
        emit: instance.emit,
      }) as InternalRenderFunction;
    }
```

Давайте проверим функциональность на примере интерфейса разработчика, который мы предположили ранее!  
Если всё работает правильно, теперь вы можете обмениваться данными между компонентами, используя props/emit!

Исходный код до этого момента:  
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/10_minimum_example/050_component_system3)
