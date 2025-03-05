# Реализация Provide/Inject

## Давайте реализуем Provide/Inject

Это реализация Provide и Inject. Реализация также довольно проста.
Основная концепция заключается в том, чтобы иметь место в ComponentInternalInstance для хранения предоставленных данных (provides) и хранить экземпляр родительского компонента для наследования данных.

Одна вещь, на которую стоит обратить внимание - это то, что есть две точки входа для provide. Одна - во время настройки компонента, что легко представить,
а другая - при вызове provide на App.

```ts
const app = createApp({
  setup() {
    //.
    //.
    //.
    provide('key', someValue) // Это случай, когда provide вызывается из компонента
    //.
    //.
  },
})

app.provide('key2', someValue2) // Provide на App
```

Теперь, где мы должны хранить то, что было предоставлено через app? Поскольку app не является компонентом, это проблема.

Чтобы дать вам ответ, скажем, что экземпляр app имеет объект под названием AppContext, и мы будем хранить объект provides в нем.

В будущем мы добавим настройки глобальных компонентов и пользовательских директив в этот AppContext.

Теперь, когда мы объяснили все до сих пор, давайте реализуем код так, чтобы он работал следующим образом!

※ Предполагаемые сигнатуры

```ts
export interface InjectionKey<_T> extends Symbol {}

export function provide<T, K = InjectionKey<T> | string | number>(
  key: K,
  value: K extends InjectionKey<infer V> ? V : T,
)

export function inject<T>(key: InjectionKey<T> | string): T | undefined
export function inject<T>(key: InjectionKey<T> | string, defaultValue: T): T
```

```ts
const Child = {
  setup() {
    const rootState = inject<{ count: number }>('RootState')
    const logger = inject(LoggerKey)

    const action = () => {
      rootState && rootState.count++
      logger?.('Hello from Child.')
    }

    return () => h('button', { onClick: action }, ['action'])
  },
}

const app = createApp({
  setup() {
    const state = reactive({ count: 1 })
    provide('RootState', state)

    return () =>
      h('div', {}, [h('p', {}, [`${state.count}`]), h(Child, {}, [])])
  },
})

type Logger = (...args: any) => void
const LoggerKey = Symbol() as InjectionKey<Logger>

app.provide(LoggerKey, window.console.log)
```

Исходный код до этого момента:
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/40_basic_component_system/020_provide_inject)
