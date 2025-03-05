# Поддержка Options API

## Options API

До сих пор мы смогли реализовать многое с помощью Composition API, но давайте также добавим поддержку Options API.

В этой книге мы поддерживаем следующее в Options API:

- props
- data
- computed
- method
- watch
- slot
- lifecycle
  - onMounted
  - onUpdated
  - onUnmounted
  - onBeforeMount
  - onBeforeUpdate
  - onBeforeUnmount
- provide/inject
- $el
- $data
- $props
- $slots
- $parent
- $emit
- $forceUpdate
- $nextTick

В качестве подхода к реализации, давайте подготовим функцию под названием "applyOptions" в "componentOptions.ts" и выполним ее ближе к концу "setupComponent".

```ts
export const setupComponent = (instance: ComponentInternalInstance) => {
  // .
  // .
  // .

  if (render) {
    instance.render = render as InternalRenderFunction
  }
  // ↑ Это существующая реализация

  setCurrentInstance(instance)
  applyOptions(instance)
  unsetCurrentInstance()
}
```

В Options API интерфейс разработчика часто имеет дело с "this".

```ts
const App = defineComponent({
  data() {
    return { message: 'hello' }
  },

  methods: {
    greet() {
      console.log(this.message) // Вот так
    },
  },
})
```

Внутренне "this" ссылается на прокси компонента в Options API, и при применении опций этот прокси привязывается.

Пример реализации ↓

```ts
export function applyOptions(instance: ComponentInternalInstance) {
  const { type: options } = instance
  const publicThis = instance.proxy! as any
  const ctx = instance.ctx

  const { methods } = options

  if (methods) {
    for (const key in methods) {
      const methodHandler = methods[key]
      if (isFunction(methodHandler)) {
        ctx[key] = methodHandler.bind(publicThis)
      }
    }
  }
}
```

В основном, если вы реализуете их по одному, используя этот принцип, это не должно быть сложным.

Если вы хотите сделать "data" реактивным, вызовите здесь функцию "reactive", а если хотите вычислить, вызовите здесь функцию "computed". (То же самое относится к "provide/inject")

Поскольку экземпляр устанавливается с помощью "setCurrentInstance" перед выполнением "applyOptions", вы можете вызывать API (Composition API), которые вы использовали до сих пор, таким же образом.

Что касается свойств, начинающихся с "$", они контролируются реализацией "componentPublicInstance". Геттер в "PublicInstanceProxyHandlers" контролирует их.

## Типизация Options API

Функционально достаточно реализовать его, как описано выше, но типизация Options API немного сложнее.

В этой книге мы поддерживаем базовую типизацию для Options API.

Сложный момент заключается в том, что тип "this" меняется в зависимости от определения пользователем каждой опции. Например, если вы определяете свойство с именем "count" типа "number" в опции "data", вы хотели бы, чтобы "this" в "computed" или "method" выводил "count: number".

Конечно, это относится не только к "data", но и к тем, что определены в "computed" или "methods".

```ts
const App = defineComponent({
  data() {
    return { count: 0 }
  },

  methods: {
    myMethod() {
      this.count // number
      this.myComputed // number
    },
  },

  computed: {
    myComputed() {
      return this.count // number
    },
  },
})
```

Чтобы достичь этого, вам нужно реализовать несколько сложную головоломку с типами (эстафету с множеством дженериков).

Начиная с типизации для "defineComponent", мы реализуем несколько типов для передачи в "ComponentOptions" и "ComponentPublicInstance".

Здесь давайте сосредоточимся на "data" и "methods" для объяснения.

Сначала обычный тип "ComponentOptions". Мы расширяем его с помощью дженериков, чтобы принимать типы "data" и "methods" как параметры, "D" и "M".

```ts
export type ComponentOptions<
  D = {},
  M extends MethodOptions = MethodOptions
> = {
  data?: () => D;,
  methods?: M;
};

interface MethodOptions {
  [key: string]: Function;
}
```

До сих пор это не должно быть слишком сложным. Это тип, который может быть применен к аргументам "defineComponent".
Конечно, в "defineComponent" также мы принимаем "D" и "M" для передачи типов, определенных пользователем. Это позволяет нам передавать определенные пользователем типы.

```ts
export function defineComponent<
  D = {},
  M extends MethodOptions = MethodOptions,
>(options: ComponentOptions<D, M>) {}
```

Проблема в том, как смешать "D" с "this" при работе с "this" в "methods" (как сделать возможным вывод типа "this.count").

Сначала "D" и "M" объединяются в "ComponentPublicInstance" (объединяются в прокси). Это можно понять следующим образом (расширить с помощью дженериков).

```ts
type ComponentPublicInstance<
  D = {},
  M extends MethodOptions = MethodOptions,
> = {
  /** Различные типы, которые имеет публичный экземпляр */
} & D &
  M
```

После этого мы смешиваем тип экземпляра в "this" в "ComponentOptions".

```ts
type ComponentOptions<D = {}, M extends MethodOptions = MethodOptions> = {
  data?: () => D
  methods?: M
} & ThisType<ComponentPublicInstance<D, M>>
```

Благодаря этому мы можем выводить свойства, определенные в "data" и "method", из "this" в опциях.

На практике нам нужно выводить различные типы, такие как "props", "computed" и "inject", но основной принцип тот же.
На первый взгляд вы можете быть ошеломлены множеством дженериков и преобразований типов (таких как извлечение только "key" из "inject"), но если вы успокоитесь и вернетесь к принципу, все должно быть в порядке.
В коде этой книги, вдохновленном оригинальным Vue, мы абстрагировали его еще на один шаг с помощью "CreateComponentPublicInstance" и реализовали тип под названием "ComponentPublicInstanceConstructor", но не беспокойтесь об этом слишком сильно. (Если вам интересно, вы можете прочитать и это!)

Исходный код до этого момента:
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/40_basic_component_system/070_options_api)
