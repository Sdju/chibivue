# Очистка эффектов и область действия эффектов

::: warning
Реализация, описанная здесь, основана на версии до текущего черновика [Оптимизации реактивности](/30-basic-reactivity-system/005-reactivity-optimization).  \
После завершения [Оптимизации реактивности](/30-basic-reactivity-system/005-reactivity-optimization) содержание этой главы будет обновлено в соответствии с ней.
:::

## Очистка ReactiveEffect

Мы не очищали эффекты, которые регистрировали до сих пор. Давайте добавим процесс очистки в ReactiveEffect.

Реализуем метод под названием `stop` в ReactiveEffect.  
Добавим флаг в ReactiveEffect, чтобы указать, активен он или нет, и в методе `stop` переключим его на `false`, удаляя зависимости.

```ts
export class ReactiveEffect<T = any> {
  active = true // Добавлено
  //.
  //.
  //.
  stop() {
    if (this.active) {
      this.active = false
    }
  }
}
```

С этой базовой реализацией все, что нам нужно сделать, это удалить все зависимости при выполнении метода `stop`.  
Кроме того, давайте добавим реализацию хуков, которая позволяет нам регистрировать обработку, которую мы хотим выполнить во время очистки, и обработку, когда `activeEffect` является самим собой.

```ts
export class ReactiveEffect<T = any> {
  private deferStop?: boolean // Добавлено
  onStop?: () => void // Добавлено
  parent: ReactiveEffect | undefined = undefined // Добавлено (будет использоваться в finally)

  run() {
    if (!this.active) {
      return this.fn() // Если active равно false, просто выполняем функцию
    }

    try {
      this.parent = activeEffect
      activeEffect = this
      const res = this.fn()
      return res
    } finally {
      activeEffect = this.parent
      this.parent = undefined
      if (this.deferStop) {
        this.stop()
      }
    }
  }

  stop() {
    if (activeEffect === this) {
      // Если activeEffect является самим собой, устанавливаем флаг для остановки после завершения run
      this.deferStop = true
    } else if (this.active) {
      // ...
      if (this.onStop) {
        this.onStop() // Выполняем зарегистрированные хуки
      }
      // ...
    }
  }
}
```

Теперь, когда мы добавили процесс очистки в ReactiveEffect, давайте также реализуем функцию очистки для watch.

Если следующий код работает, все в порядке.

```ts
import { createApp, h, reactive, watch } from 'chibivue'

const app = createApp({
  setup() {
    const state = reactive({ count: 0 })
    const increment = () => {
      state.count++
    }

    const unwatch = watch(
      () => state.count,
      (newValue, oldValue, cleanup) => {
        alert(`Новое значение: ${newValue}, старое значение: ${oldValue}`)
        cleanup(() => alert('Очистка!'))
      },
    )

    return () =>
      h('div', {}, [
        h('p', {}, [`count: ${state.count}`]),
        h('button', { onClick: increment }, [`increment`]),
        h('button', { onClick: unwatch }, [`unwatch`]),
      ])
  },
})

app.mount('#app')
```

Исходный код до этого момента:  
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/30_basic_reactivity_system/130_cleanup_effects)

## Что такое Effect Scope

Теперь, когда мы можем очищать эффекты, мы хотим очищать ненужные эффекты, когда компонент размонтируется. Однако собирать большое количество эффектов, будь то watch или computed, немного утомительно. Если мы попытаемся реализовать это прямолинейно, это будет выглядеть так:

```ts
let disposables = []

const counter = ref(0)

const doubled = computed(() => counter.value * 2)
disposables.push(() => stop(doubled.effect))

const stopWatch = watchEffect(() => console.log(`counter: ${counter.value}`))
disposables.push(stopWatch)
```

```ts
// очистка эффектов
disposables.forEach(f => f())
disposables = []
```

Такое управление утомительно и подвержено ошибкам.

Поэтому в Vue есть механизм под названием EffectScope.  
https://github.com/vuejs/rfcs/blob/master/active-rfcs/0041-reactivity-effect-scope.md

Идея заключается в том, чтобы иметь один EffectScope на экземпляр, и конкретно, он имеет следующий интерфейс:

```ts
const scope = effectScope()

scope.run(() => {
  const doubled = computed(() => counter.value * 2)

  watch(doubled, () => console.log(doubled.value))

  watchEffect(() => console.log('Count: ', doubled.value))
})

// для удаления всех эффектов в области
scope.stop()
```

Цитата из: https://github.com/vuejs/rfcs/blob/master/active-rfcs/0041-reactivity-effect-scope.md#basic-example

И этот EffectScope также предоставляется как API для пользователя.  
https://v3.vuejs.org/api/reactivity-advanced.html#effectscope

## Реализация EffectScope

Как упоминалось ранее, у нас будет один EffectScope на экземпляр.

```ts
export interface ComponentInternalInstance {
  scope: EffectScope
}
```

И когда компонент размонтируется, мы останавливаем собранные эффекты.

```ts
const unmountComponent = (...) => {
  // .
  // .
  const { scope } = instance;
  scope.stop();
  // .
  // .
}
```

Структура EffectScope следующая: он имеет переменную под названием `activeEffectScope`, которая указывает на текущий активный EffectScope, и управляет своим состоянием с помощью методов `on/off/run/stop`, реализованных в EffectScope.  
Методы `on/off` поднимают себя как `activeEffectScope` или восстанавливают поднятое состояние (возвращаются к исходному EffectScope).  
И когда создается ReactiveEffect, он регистрируется в `activeEffectScope`.

Поскольку это может быть немного сложно понять, если мы напишем образ в исходном коде,

```ts
instance.scope.on()

/** Создается некоторый ReactiveEffect, такой как computed или watch */
setup()

instance.scope.off()
```

С этим мы можем собирать сгенерированные эффекты в EffectScope экземпляра.  
Затем, когда вызывается метод `stop` этого эффекта, мы можем очистить все эффекты.

Вы должны были понять основные принципы, так что давайте попробуем реализовать это, читая исходный код!

Исходный код до этого момента:  
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/30_basic_reactivity_system/140_effect_scope)
