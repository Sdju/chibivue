# ref api (Начало раздела базовой системы реактивности)

::: warning
Реализация, описанная здесь, основана на версии до текущего черновика [Оптимизации реактивности](/30-basic-reactivity-system/005-reactivity-optimization).  \
После завершения [Оптимизации реактивности](/30-basic-reactivity-system/005-reactivity-optimization) содержание этой главы будет обновлено в соответствии с ней.
:::

## Обзор ref api (и реализация)

Vue.js имеет различные API, связанные с реактивностью, и среди них ref особенно известен.  
Даже в официальной документации он представлен как первая тема под названием "Reactivity Core".  
https://vuejs.org/api/reactivity-core.html#ref

Итак, что такое ref API?
Согласно официальной документации,

> Объект ref является изменяемым - т.е. вы можете присваивать новые значения .value. Он также реактивен - т.е. любые операции чтения .value отслеживаются, а операции записи вызывают связанные эффекты.

> Если объект присваивается как значение ref, объект становится глубоко реактивным с помощью reactive(). Это также означает, что если объект содержит вложенные refs, они будут глубоко развернуты.

(Цитата: https://vuejs.org/api/reactivity-core.html#ref)

Короче говоря, объект ref имеет две характеристики:

- Операции get/set над свойством value вызывают track/trigger.
- Когда объект присваивается свойству value, свойство value становится реактивным объектом.

Чтобы объяснить это в коде,

```ts
const count = ref(0)
count.value++ // эффект (характеристика 1)

const state = ref({ count: 0 })
state.value = { count: 1 } // эффект (характеристика 1)
state.value.count++ // эффект (характеристика 2)
```

Вот что это значит.

Пока вы не можете различить ref и reactive, вы можете путать различие между `ref(0)` и `reactive({ value: 0 })`, но учитывая две упомянутые выше характеристики, вы можете увидеть, что они имеют совершенно разные значения.
ref не генерирует реактивный объект типа `{ value: x }`. track/trigger для операций get/set над value выполняется реализацией ref, и если часть, соответствующая x, является объектом, она становится реактивным объектом.

С точки зрения реализации, это выглядит так:

```ts
class RefImpl<T> {
  private _value: T
  public dep?: Dep = undefined

  get value() {
    trackRefValue(this)
  }

  set value(newVal) {
    this._value = toReactive(v)
    triggerRefValue(this)
  }
}

const toReactive = <T extends unknown>(value: T): T =>
  isObject(value) ? reactive(value) : value
```

Давайте реализуем ref, изучая исходный код!
Есть различные функции и классы, но пока достаточно сосредоточиться на классе RefImpl и функции ref.

Как только вы сможете запустить следующий исходный код, все в порядке!
(Примечание: Компилятор шаблонов должен отдельно поддерживать ref, поэтому он не будет работать)

```ts
import { createApp, h, ref } from 'chibivue'

const app = createApp({
  setup() {
    const count = ref(0)

    return () =>
      h('div', {}, [
        h('p', {}, [`count: ${count.value}`]),
        h('button', { onClick: () => count.value++ }, ['Increment']),
      ])
  },
})

app.mount('#app')
```

Исходный код до этого момента:  
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/30_basic_reactivity_system/010_ref)

## shallowRef

Теперь давайте продолжим реализацию других API, связанных с ref.  
Как упоминалось ранее, одной из характеристик ref является то, что "когда объект присваивается свойству value, свойство value становится реактивным объектом". shallowRef не имеет этой характеристики.

> В отличие от ref(), внутреннее значение shallow ref хранится и предоставляется как есть, и не будет сделано глубоко реактивным. Только доступ к .value является реактивным.

(Цитата: https://vuejs.org/api/reactivity-advanced.html#shallowref)

Задача очень проста. Мы можем использовать реализацию RefImpl как есть и пропустить часть `toReactive`.  
Давайте реализуем это, читая исходный код!

Как только вы сможете запустить следующий исходный код, все в порядке!

```ts
import { createApp, h, shallowRef } from 'chibivue'

const app = createApp({
  setup() {
    const state = shallowRef({ count: 0 })

    return () =>
      h('div', {}, [
        h('p', {}, [`count: ${state.value.count}`]),

        h(
          'button',
          {
            onClick: () => {
              state.value = { count: state.value.count + 1 }
            },
          },
          ['increment'],
        ),

        h(
          'button', // Нажатие не вызывает повторный рендеринг
          {
            onClick: () => {
              state.value.count++
            },
          },
          ['not trigger ...'],
        ),
      ])
  },
})

app.mount('#app')
```

### triggerRef

Как упоминалось ранее, поскольку значение shallow ref не является реактивным объектом, изменения в нем не будут вызывать эффекты.  
Однако само значение является объектом, поэтому оно было изменено.  
Поэтому существует API для принудительного вызова эффектов. Это triggerRef.

https://vuejs.org/api/reactivity-advanced.html#triggerref

```ts
import { createApp, h, shallowRef, triggerRef } from 'chibivue'

const app = createApp({
  setup() {
    const state = shallowRef({ count: 0 })
    const forceUpdate = () => {
      triggerRef(state)
    }

    return () =>
      h('div', {}, [
        h('p', {}, [`count: ${state.value.count}`]),

        h(
          'button',
          {
            onClick: () => {
              state.value = { count: state.value.count + 1 }
            },
          },
          ['increment'],
        ),

        h(
          'button', // Нажатие не вызывает повторный рендеринг
          {
            onClick: () => {
              state.value.count++
            },
          },
          ['not trigger ...'],
        ),

        h(
          'button', // Рендеринг обновляется до значения, которое в данный момент содержится в state.value.count
          { onClick: forceUpdate },
          ['force update !'],
        ),
      ])
  },
})

app.mount('#app')
```

Исходный код до этого момента:  
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/30_basic_reactivity_system/020_shallow_ref)

## toRef

toRef - это API, который генерирует ref для свойства реактивного объекта.

https://vuejs.org/api/reactivity-utilities.html#toref

Он часто используется для преобразования определенных свойств props в refs.

```ts
const count = toRef(props, 'count')
console.log(count.value)
```

Ref, созданный с помощью toRef, синхронизируется с исходным реактивным объектом.
Если вы вносите изменения в этот ref, исходный реактивный объект также будет обновлен, и если есть какие-либо изменения в исходном реактивном объекте, этот ref также будет обновлен.

```ts
import { createApp, h, reactive, toRef } from 'chibivue'

const app = createApp({
  setup() {
    const state = reactive({ count: 0 })
    const stateCountRef = toRef(state, 'count')

    return () =>
      h('div', {}, [
        h('p', {}, [`state.count: ${state.count}`]),
        h('p', {}, [`stateCountRef.value: ${stateCountRef.value}`]),
        h('button', { onClick: () => state.count++ }, ['updateState']),
        h('button', { onClick: () => stateCountRef.value++ }, ['updateRef']),
      ])
  },
})

app.mount('#app')
```

Давайте реализуем, читая исходный код!

※ Начиная с v3.3, в toRef была добавлена функция нормализации. chibivue не реализует эту функцию.  
Пожалуйста, проверьте сигнатуру в официальной документации для получения более подробной информации! (https://vuejs.org/api/reactivity-utilities.html#toref)

Исходный код до этого момента:  
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/30_basic_reactivity_system/030_to_ref)

## toRefs

Генерирует refs для всех свойств реактивного объекта.

https://vuejs.org/api/reactivity-utilities.html#torefs

```ts
import { createApp, h, reactive, toRefs } from 'chibivue'

const app = createApp({
  setup() {
    const state = reactive({ foo: 1, bar: 2 })
    const stateAsRefs = toRefs(state)

    return () =>
      h('div', {}, [
        h('p', {}, [`[state]: foo: ${state.foo}, bar: ${state.bar}`]),
        h('p', {}, [
          `[stateAsRefs]: foo: ${stateAsRefs.foo.value}, bar: ${stateAsRefs.bar.value}`,
        ]),
        h('button', { onClick: () => state.foo++ }, ['update state.foo']),
        h('button', { onClick: () => stateAsRefs.bar.value++ }, [
          'update stateAsRefs.bar.value',
        ]),
      ])
  },
})

app.mount('#app')
```

Это можно легко реализовать, используя реализацию toRef.

Исходный код до этого момента:  
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/30_basic_reactivity_system/040_to_refs)
