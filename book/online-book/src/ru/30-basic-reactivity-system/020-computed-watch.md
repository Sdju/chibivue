# computed / watch api

::: warning
Реализация, описанная здесь, основана на версии до текущего черновика [Оптимизации реактивности](/30-basic-reactivity-system/005-reactivity-optimization).  \
После завершения [Оптимизации реактивности](/30-basic-reactivity-system/005-reactivity-optimization) содержание этой главы будет обновлено в соответствии с ней.
:::

## Обзор computed (и реализация)

В предыдущей главе мы реализовали API, связанные с ref. Теперь поговорим о computed.
https://vuejs.org/api/reactivity-core.html#computed

Computed имеет две сигнатуры: только для чтения и для записи.

```ts
// только для чтения
function computed<T>(
  getter: () => T,
  // см. ссылку "Отладка Computed" ниже
  debuggerOptions?: DebuggerOptions,
): Readonly<Ref<Readonly<T>>>

// для записи
function computed<T>(
  options: {
    get: () => T
    set: (value: T) => void
  },
  debuggerOptions?: DebuggerOptions,
): Ref<T>
```

Официальная реализация немного сложна, но давайте начнем с простой структуры.

Самый простой способ реализации - вызывать callback каждый раз, когда значение извлекается.

```ts
export class ComputedRefImpl<T> {
  constructor(private getter: ComputedGetter<T>) {}

  get value() {
    return this.getter()
  }

  set value() {}
}
```

Однако это не совсем computed. Это просто вызов функции (что не очень интересно).

На самом деле мы хотим отслеживать зависимости и пересчитывать значение при его изменении.

Для этого мы используем механизм, где мы обновляем флаг `_dirty` как задачу планировщика.
Флаг `_dirty` - это флаг, который показывает, нужно ли пересчитывать значение или нет. Он обновляется при срабатывании зависимости.

Вот пример того, как это работает:

```ts
export class ComputedRefImpl<T> {
  public dep?: Dep = undefined
  private _value!: T
  public readonly effect: ReactiveEffect<T>
  public _dirty = true

  constructor(getter: ComputedGetter<T>) {
    this.effect = new ReactiveEffect(getter, () => {
      if (!this._dirty) {
        this._dirty = true
      }
    })
  }

  get value() {
    trackRefValue(this)
    if (this._dirty) {
      this._dirty = false
      this._value = this.effect.run()
    }
    return this._value
  }
}
```

Computed на самом деле имеет ленивую природу вычисления, поэтому значение пересчитывается только при первом чтении.
Мы обновляем этот флаг в true, и функция запускается несколькими зависимостями, поэтому мы регистрируем его как планировщик ReactiveEffect.

Это основной поток. При реализации есть несколько моментов, на которые стоит обратить внимание, поэтому давайте подведем итоги ниже.

- При обновлении флага `_dirty` в true, вызываем зависимости, которые он имеет.
  ```ts
  if (!this._dirty) {
    this._dirty = true
    triggerRefValue(this)
  }
  ```
- Поскольку computed классифицируется как `ref`, отмечаем `__v_isRef` как true.
- Если вы хотите реализовать сеттер, реализуйте его в последнюю очередь. Сначала стремитесь сделать его вычисляемым.

Теперь мы готовы, давайте реализуем это! Если код ниже работает как ожидается, все в порядке! (Пожалуйста, убедитесь, что срабатывают только зависимости computed!)

```ts
import { computed, createApp, h, reactive, ref } from 'chibivue'

const app = createApp({
  setup() {
    const count = reactive({ value: 0 })
    const count2 = reactive({ value: 0 })
    const double = computed(() => {
      console.log('computed')
      return count.value * 2
    })
    const doubleDouble = computed(() => {
      console.log('computed (doubleDouble)')
      return double.value * 2
    })

    const countRef = ref(0)
    const doubleCountRef = computed(() => {
      console.log('computed (doubleCountRef)')
      return countRef.value * 2
    })

    return () =>
      h('div', {}, [
        h('p', {}, [`count: ${count.value}`]),
        h('p', {}, [`count2: ${count2.value}`]),
        h('p', {}, [`double: ${double.value}`]),
        h('p', {}, [`doubleDouble: ${doubleDouble.value}`]),
        h('p', {}, [`doubleCountRef: ${doubleCountRef.value}`]),
        h('button', { onClick: () => count.value++ }, ['update count']),
        h('button', { onClick: () => count2.value++ }, ['update count2']),
        h('button', { onClick: () => countRef.value++ }, ['update countRef']),
      ])
  },
})

app.mount('#app')
```

Исходный код до этого момента:
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/30_basic_reactivity_system/050_computed)
(с сеттером):
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/30_basic_reactivity_system/060_computed_setter)

## Реализация Watch

https://vuejs.org/api/reactivity-core.html#watch

Существуют различные формы API watch. Давайте начнем с реализации самой простой формы, которая наблюдает с помощью функции getter.
Сначала давайте стремиться к тому, чтобы код ниже работал.

```ts
import { createApp, h, reactive, watch } from 'chibivue'

const app = createApp({
  setup() {
    const state = reactive({ count: 0 })
    watch(
      () => state.count,
      () => alert('state.count был изменен!'),
    )

    return () =>
      h('div', {}, [
        h('p', {}, [`count: ${state.count}`]),
        h('button', { onClick: () => state.count++ }, ['update state']),
      ])
  },
})

app.mount('#app')
```

Реализация watch находится не в reactivity, а в runtime-core (apiWatch.ts).

Это может выглядеть немного сложно, потому что там смешаны различные API, но на самом деле это довольно просто, если сузить область.
Я уже реализовал сигнатуру целевого API (функция watch) ниже, поэтому попробуйте реализовать его. Я верю, что вы сможете это сделать, если приобрели знания о реактивности до сих пор!

```ts
export type WatchEffect = (onCleanup: OnCleanup) => void

export type WatchSource<T = any> = () => T

type OnCleanup = (cleanupFn: () => void) => void

export function watch<T>(
  source: WatchSource<T>,
  cb: (newValue: T, oldValue: T) => void,
) {
  // TODO:
}
```

Исходный код до этого момента:
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/30_basic_reactivity_system/070_watch)

## Другие API watch

Как только у вас есть база, это просто вопрос расширения. Дальнейшие объяснения не нужны.

- Наблюдение за ref
  ```ts
  const count = ref(0)
  watch(count, () => {
    /** некоторые эффекты */
  })
  ```
- Наблюдение за несколькими источниками

  ```ts
  const count = ref(0)
  const count2 = ref(0)
  const count3 = ref(0)
  watch([count, count2, count3], () => {
    /** некоторые эффекты */
  })
  ```

- Immediate

  ```ts
  const count = ref(0)
  watch(
    count,
    () => {
      /** некоторые эффекты */
    },
    { immediate: true },
  )
  ```

- Deep

  ```ts
  const state = reactive({ count: 0 })
  watch(
    () => state,
    () => {
      /** некоторые эффекты */
    },
    { deep: true },
  )
  ```

- Реактивный объект

  ```ts
  const state = reactive({ count: 0 })
  watch(state, () => {
    /** некоторые эффекты */
  }) // автоматически в режиме deep
  ```

Исходный код до этого момента:
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/30_basic_reactivity_system/080_watch_api_extends)

## watchEffect

https://vuejs.org/api/reactivity-core.html#watcheffect

Реализация watchEffect проста с использованием реализации watch.

```ts
const count = ref(0)

watchEffect(() => console.log(count.value))
// -> выводит 0

count.value++
// -> выводит 1
```

Вы можете реализовать это как immediate для образа.

Исходный код до этого момента:  
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/30_basic_reactivity_system/090_watch_effect)

---

※ Очистка будет сделана в отдельной главе.
