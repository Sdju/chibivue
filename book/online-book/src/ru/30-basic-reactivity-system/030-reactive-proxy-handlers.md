# Различные обработчики реактивных прокси

::: warning
Реализация, описанная здесь, основана на версии до текущего черновика [Оптимизации реактивности](/30-basic-reactivity-system/005-reactivity-optimization).  \
После завершения [Оптимизации реактивности](/30-basic-reactivity-system/005-reactivity-optimization) содержание этой главы будет обновлено в соответствии с ней.
:::

## Объекты, которые не должны быть реактивными

Теперь давайте решим проблему с текущей системой реактивности.  
Сначала попробуйте запустить следующий код.

```ts
import { createApp, h, ref } from 'chibivue'

const app = createApp({
  setup() {
    const inputRef = ref<HTMLInputElement | null>(null)
    const getRef = () => {
      inputRef.value = document.getElementById(
        'my-input',
      ) as HTMLInputElement | null
      console.log(inputRef.value)
    }

    return () =>
      h('div', {}, [
        h('input', { id: 'my-input' }, []),
        h('button', { onClick: getRef }, ['getRef']),
      ])
  },
})

app.mount('#app')
```

Если вы проверите консоль, вы должны увидеть следующий результат:

![reactive_html_element](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/reactive_html_element.png)

Теперь давайте добавим функцию фокуса.

```ts
import { createApp, h, ref } from 'chibivue'

const app = createApp({
  setup() {
    const inputRef = ref<HTMLInputElement | null>(null)
    const getRef = () => {
      inputRef.value = document.getElementById(
        'my-input',
      ) as HTMLInputElement | null
      console.log(inputRef.value)
    }
    const focus = () => {
      inputRef.value?.focus()
    }

    return () =>
      h('div', {}, [
        h('input', { id: 'my-input' }, []),
        h('button', { onClick: getRef }, ['getRef']),
        h('button', { onClick: focus }, ['focus']),
      ])
  },
})

app.mount('#app')
```

Удивительно, но это вызывает ошибку.

![focus_in_reactive_html_element](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/focus_in_reactive_html_element.png)

Причина в том, что элемент, полученный с помощью `document.getElementById`, используется для генерации самого Proxy.

Когда генерируется Proxy, значение становится Proxy вместо исходного объекта, что приводит к потере функциональности HTML-элемента.

## Определение объекта перед генерацией реактивного Proxy

Метод определения очень прост. Используйте `Object.prototype.toString`.
Давайте посмотрим, как `Object.prototype.toString` определяет HTMLInputElement в коде выше.

```ts
import { createApp, h, ref } from 'chibivue'

const app = createApp({
  setup() {
    const inputRef = ref<HTMLInputElement | null>(null)
    const getRef = () => {
      inputRef.value = document.getElementById(
        'my-input',
      ) as HTMLInputElement | null
      console.log(inputRef.value?.toString())
    }
    const focus = () => {
      inputRef.value?.focus()
    }

    return () =>
      h('div', {}, [
        h('input', { id: 'my-input' }, []),
        h('button', { onClick: getRef }, ['getRef']),
        h('button', { onClick: focus }, ['focus']),
      ])
  },
})

app.mount('#app')
```

![element_to_string](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/element_to_string.png)

Это позволяет нам определить тип объекта. Хотя это несколько жестко закодировано, давайте обобщим эту функцию определения.

```ts
// shared/general.ts
export const objectToString = Object.prototype.toString // уже используется в isMap и isSet
export const toTypeString = (value: unknown): string =>
  objectToString.call(value)

// Функция, которую нужно добавить в этот раз
export const toRawType = (value: unknown): string => {
  return toTypeString(value).slice(8, -1)
}
```

Причина использования `slice` в том, чтобы получить строку, соответствующую `hoge` в `[Object hoge]`.

Затем давайте определим тип объекта, используя `reactive toRawType`, и выполним ветвление.
Пропустим генерацию Proxy для HTMLInput.

В reactive.ts получим rawType и определим тип объекта, который будет целью reactive.

```ts
const enum TargetType {
  INVALID = 0,
  COMMON = 1,
}

function targetTypeMap(rawType: string) {
  switch (rawType) {
    case 'Object':
    case 'Array':
      return TargetType.COMMON
    default:
      return TargetType.INVALID
  }
}

function getTargetType<T extends object>(value: T) {
  return !Object.isExtensible(value)
    ? TargetType.INVALID
    : targetTypeMap(toRawType(value))
}
```

```ts
export function reactive<T extends object>(target: T): T {
  const targetType = getTargetType(target)
  if (targetType === TargetType.INVALID) {
    return target
  }

  const proxy = new Proxy(target, mutableHandlers)
  return proxy as T
}
```

Теперь код фокуса должен работать!

![focus_in_element](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/focus_in_element.png)

## Реализация TemplateRefs

Теперь, когда мы можем помещать HTML-элементы в Ref, давайте реализуем TemplateRef.

Ref можно использовать для ссылки на шаблон с помощью атрибута ref.

https://vuejs.org/guide/essentials/template-refs.html

Цель - сделать так, чтобы следующий код работал:

```ts
import { createApp, h, ref } from 'chibivue'

const app = createApp({
  setup() {
    const inputRef = ref<HTMLInputElement | null>(null)
    const focus = () => {
      inputRef.value?.focus()
    }

    return () =>
      h('div', {}, [
        h('input', { ref: inputRef }, []),
        h('button', { onClick: focus }, ['focus']),
      ])
  },
})

app.mount('#app')
```

Если вы дошли до этого момента, вы, вероятно, уже видите, как это реализовать.
Да, просто добавьте ref к VNode и внедрите значение во время рендеринга.

```ts
export interface VNode<HostNode = any> {
  // .
  // .
  key: string | number | symbol | null
  ref: Ref | null // Это
  // .
  // .
}
```

В оригинальной реализации это называется `setRef`. Найдите его, прочитайте и реализуйте!
В оригинальной реализации это более сложно, с ref в виде массива и доступом через `$ref`, но пока давайте стремиться к коду, который работает с приведенным выше кодом.

Кстати, если это компонент, присвойте `setupContext` компонента ref.  
(Примечание: На самом деле вы должны передать прокси компонента, но он еще не реализован, поэтому мы пока используем `setupContext`.)

```ts
import { createApp, h, ref } from 'chibivue'

const Child = {
  setup() {
    const action = () => alert('clicked!')
    return { action }
  },

  template: `<button @click="action">action (child)</button>`,
}

const app = createApp({
  setup() {
    const childRef = ref<any>(null)
    const childAction = () => {
      childRef.value?.action()
    }

    return () =>
      h('div', {}, [
        h('div', {}, [
          h(Child, { ref: childRef }, []),
          h('button', { onClick: childAction }, ['action (parent)']),
        ]),
      ])
  },
})

app.mount('#app')
```

Исходный код до этого момента:  
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/30_basic_reactivity_system/110_template_refs)

## Обработка объектов с изменяющимися ключами

На самом деле, текущая реализация не может обрабатывать объекты с изменяющимися ключами.
Это включает также массивы.
Другими словами, следующие компоненты не работают правильно:

```ts
const App = {
  setup() {
    const array = ref<number[]>([])
    const mutateArray = () => {
      array.value.push(Date.now()) // Эффект не срабатывает даже при вызове этого (ключ для set - "0")
    }

    const record = reactive<Record<string, number>>({})
    const mutateRecord = () => {
      record[Date.now().toString()] = Date.now() // Эффект не срабатывает даже при изменении ключа
    }

    return () =>
      h('div', {}, [
        h('p', {}, [`array: ${JSON.stringify(array.value)}`]),
        h('button', { onClick: mutateArray }, ['update array']),

        h('p', {}, [`record: ${JSON.stringify(record)}`]),
        h('button', { onClick: mutateRecord }, ['update record']),
      ])
  },
}
```

Как мы можем решить это?

### Для массивов

Массивы по сути являются объектами, поэтому когда добавляется новый элемент, его индекс передается как ключ в обработчик `set` Proxy.

```ts
const p = new Proxy([], {
  set(target, key, value, receiver) {
    console.log(key) // ※
    Reflect.set(target, key, value, receiver)
    return true
  },
})

p.push(42) // 0
```

Однако мы не можем отслеживать каждый из этих ключей по отдельности.
Поэтому мы можем отслеживать `length` массива, чтобы вызывать изменения в массиве.

Стоит отметить, что `length` уже отслеживается.

Если вы выполните следующий код в браузере или подобной среде, вы увидите, что `length` вызывается при преобразовании массива в строку с помощью `JSON.stringify`.

```ts
const data = new Proxy([], {
  get(target, key) {
    console.log('get!', key)
    return Reflect.get(target, key)
  },
})

JSON.stringify(data)
// get! length
// get! toJSON
```

Другими словами, `length` уже имеет зарегистрированный эффект. Поэтому все, что нам нужно сделать, это извлечь этот эффект и вызвать его при установке индекса.

Если ключ определяется как индекс, мы вызываем эффект `length`.
Конечно, могут быть и другие зависимости, поэтому мы извлекаем их в массив под названием `deps` и вызываем эффекты вместе.

```ts
export function trigger(target: object, key?: unknown) {
  const depsMap = targetMap.get(target)
  if (!depsMap) return

  let deps: (Dep | undefined)[] = []
  if (key !== void 0) {
    deps.push(depsMap.get(key))
  }

  // Это
  if (isIntegerKey(key)) {
    deps.push(depsMap.get('length'))
  }

  for (const dep of deps) {
    if (dep) {
      triggerEffects(dep)
    }
  }
}
```

```ts
// shared/general.ts
export const isIntegerKey = (key: unknown) =>
  isString(key) &&
  key !== 'NaN' &&
  key[0] !== '-' &&
  '' + parseInt(key, 10) === key
```

Теперь массивы должны работать правильно.

### Для объектов (Records)

Теперь давайте рассмотрим объекты. В отличие от массивов, объекты не имеют свойства `length`.

Мы можем сделать небольшую модификацию здесь.
Мы можем подготовить символ под названием `ITERATE_KEY` и использовать его аналогично свойству `length` для массивов.
Возможно, вы не понимаете, что я имею в виду, но поскольку `depsMap` - это просто Map, нет проблем в использовании символа, который мы определяем как ключ.

Порядок операций немного отличается от массивов, но давайте начнем с рассмотрения функции `trigger`.
Мы можем реализовать это так, как будто существует `ITERATE_KEY` с зарегистрированными эффектами.

```ts
export const ITERATE_KEY = Symbol()

export function trigger(target: object, key?: unknown) {
  const depsMap = targetMap.get(target)
  if (!depsMap) return

  let deps: (Dep | undefined)[] = []
  if (key !== void 0) {
    deps.push(depsMap.get(key))
  }

  if (!isArray(target)) {
    // Если это не массив, вызываем эффект, зарегистрированный с ITERATE_KEY
    deps.push(depsMap.get(ITERATE_KEY))
  } else if (isIntegerKey(key)) {
    // Новый индекс добавлен в массив -> length изменяется
    deps.push(depsMap.get('length'))
  }

  for (const dep of deps) {
    if (dep) {
      triggerEffects(dep)
    }
  }
}
```

Проблема в том, как отслеживать эффекты для `ITERATE_KEY`.

Здесь мы можем использовать обработчик `ownKeys` Proxy.

https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/ownKeys

`ownKeys` вызывается функциями типа `Object.keys()` или `Reflect.ownKeys()`, но он также вызывается `JSON.stringify`.

Вы можете подтвердить это, запустив следующий код в браузере или подобной среде:

```ts
const data = new Proxy(
  {},
  {
    get(target, key) {
      return Reflect.get(target, key)
    },
    ownKeys(target) {
      console.log('ownKeys!!!')
      return Reflect.ownKeys(target)
    },
  },
)

JSON.stringify(data)
```

Мы можем использовать это для отслеживания `ITERATE_KEY`.
Для массивов это не нужно, поэтому мы можем просто отслеживать `length`.

```ts
export const mutableHandlers: ProxyHandler<object> = {
  // .
  // .
  ownKeys(target) {
    track(target, isArray(target) ? 'length' : ITERATE_KEY)
    return Reflect.ownKeys(target)
  },
}
```

Теперь мы должны уметь обрабатывать объекты с изменяющимися ключами!

## Поддержка встроенных объектов на основе коллекций

В настоящее время, когда мы смотрим на реализацию reactive.ts, она нацелена только на Object и Array.

```ts
function targetTypeMap(rawType: string) {
  switch (rawType) {
    case 'Object':
    case 'Array':
      return TargetType.COMMON
    default:
      return TargetType.INVALID
  }
}
```

В Vue.js, помимо этих, он также поддерживает Map, Set, WeakMap и WeakSet.

https://github.com/vuejs/core/blob/9f8e98af891f456cc8cc9019a31704e5534d1f08/packages/reactivity/src/reactive.ts#L43C1-L56C2

И эти объекты реализованы как отдельные обработчики Proxy. Это называется `collectionHandlers`.

Здесь мы реализуем этот `collectionHandlers` и стремимся к тому, чтобы следующий код работал.

```ts
const app = createApp({
  setup() {
    const state = reactive({ map: new Map(), set: new Set() })

    return () =>
      h('div', {}, [
        h('h1', {}, [`ReactiveCollection`]),

        h('p', {}, [
          `map (${state.map.size}): ${JSON.stringify([...state.map])}`,
        ]),
        h('button', { onClick: () => state.map.set(Date.now(), 'item') }, [
          'update map',
        ]),

        h('p', {}, [
          `set (${state.set.size}): ${JSON.stringify([...state.set])}`,
        ]),
        h('button', { onClick: () => state.set.add('item') }, ['update set']),
      ])
  },
})

app.mount('#app')
```

В `collectionHandlers` мы реализуем обработчики для методов, таких как add, set и delete.  
Реализацию этих методов можно найти в `collectionHandlers.ts`.  
https://github.com/vuejs/core/blob/9f8e98af891f456cc8cc9019a31704e5534d1f08/packages/reactivity/src/collectionHandlers.ts#L0-L1  
Определяя `TargetType`, если это тип коллекции, мы генерируем Proxy на основе этого обработчика для `h`.  
Давайте реализуем это!

Одна вещь, на которую стоит обратить внимание, это то, что при передаче самой цели в receiver Reflect, это может вызвать бесконечный цикл, если у самой цели установлен Proxy.  
Чтобы избежать этого, мы меняем структуру, чтобы иметь сырые данные, прикрепленные к цели, и при реализации обработчика Proxy мы изменяем его для работы с этими сырыми данными.

```ts
export const enum ReactiveFlags {
  RAW = '__v_raw',
}

export interface Target {
  [ReactiveFlags.RAW]?: any
}
```

Строго говоря, эта реализация должна была быть сделана и для обычного обработчика reactive, но она была опущена, чтобы минимизировать ненужные объяснения и потому что до сих пор не было проблем.  
Давайте попробуем реализовать это так, чтобы если ключ, который входит в геттер, является `ReactiveFlags.RAW`, он возвращал сырые данные вместо Proxy.

Вместе с этим мы также реализуем функцию под названием `toRaw`, которая рекурсивно извлекает сырые данные из цели и в конечном итоге получает данные, которые находятся в сыром состоянии.

```ts
export function toRaw<T>(observed: T): T {
  const raw = observed && (observed as Target)[ReactiveFlags.RAW]
  return raw ? toRaw(raw) : observed
}
```

Кстати, эта функция `toRaw` также предоставляется как функция API.

https://vuejs.org/api/reactivity-advanced.html#toraw

Исходный код до этого момента:  
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/30_basic_reactivity_system/120_proxy_handler_improvement)
