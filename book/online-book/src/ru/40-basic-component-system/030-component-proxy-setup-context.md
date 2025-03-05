# Прокси и setupContext компонентов

## Прокси компонентов

Одна важная концепция, которую имеют компоненты, называется Proxy.
Простыми словами, это Proxy, который позволяет получить доступ к данным (публичным свойствам) экземпляра компонента.
Proxy объединяет результаты setup (состояние, функции), data, props и другие доступы.

Давайте рассмотрим следующий код (включая части, которые не реализованы в chibivue, поэтому, пожалуйста, думайте о нем как о обычном Vue):

```vue
<script>
export default defineComponent({
  props: { parentCount: { type: Number, default: 0 } },
  data() {
    return { dataState: { count: 0 } }
  },
  methods: {
    incrementData() {
      this.dataState.count++
    },
  },
  setup() {
    const state = reactive({ count: 0 })
    const increment = () => {
      state.count++
    }

    return { state, increment }
  },
})
</script>

<template>
  <div>
    <p>count (parent): {{ parentCount }}</p>

    <br />

    <p>count (data): {{ dataState.count }}</p>
    <button @click="incrementData">increment (data)</button>

    <br />

    <p>count: {{ state.count }}</p>
    <button @click="increment">increment</button>
  </div>
</template>
```

Этот код работает правильно, но как он привязывается к шаблону?

Давайте рассмотрим другой пример.

```vue
<script setup>
const ChildRef = ref()

// Доступ к методам и данным компонента
// ChildRef.value?.incrementData
// ChildRef.value?.increment
</script>

<template>
  <!-- Child - это компонент, упомянутый ранее -->
  <Child :ref="ChildRef" />
</template>
```

В этом случае вы можете получить доступ к информации компонента через ref.

Чтобы достичь этого, ComponentInternalInstance имеет свойство под названием proxy, которое содержит Proxy для доступа к данным.

Другими словами, шаблон (функция рендеринга) и ref ссылаются на instance.proxy.

```ts
interface ComponentInternalInstance {
  proxy: ComponentPublicInstance | null
}
```

Реализация этого proxy выполняется с использованием Proxy, и это примерно следующее:

```ts
instance.proxy = instance.proxy = new Proxy(
  instance,
  PublicInstanceProxyHandlers,
)

export const PublicInstanceProxyHandlers: ProxyHandler<any> = {
  get(instance: ComponentRenderContext, key: string) {
    const { setupState, ctx, props } = instance

    // Проверяем setupState -> props -> ctx по порядку на основе ключа и возвращаем значение, если оно существует
  },
}
```

Давайте реализуем этот Proxy!

После реализации давайте изменим код, чтобы передать этот proxy в функцию рендеринга и ref.

Исходный код до этого момента:
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/40_basic_component_system/030_component_proxy)

※ Кстати, я также реализовал реализацию defineComponent и связанную проверку типов (это позволяет нам выводить тип данных прокси).

![infer_component_types](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/infer_component_types.png)

## setupContext

https://ja.vuejs.org/api/composition-api-setup.html#setup-context

Vue имеет концепцию под названием setupContext. Это контекст, предоставляемый в функции setup, который включает emit и expose.

На данный момент emit работает, но он реализован несколько грубо.

```ts
const setupResult = component.setup(instance.props, {
  emit: instance.emit,
})
```

Давайте правильно определим интерфейс SetupContext и представим его как объект, который хранит экземпляр.

```ts
export interface ComponentInternalInstance {
  // .
  // .
  // .
  setupContext: SetupContext | null // Добавлено
}

export type SetupContext = {
  emit: (e: string, ...args: any[]) => void
}
```

Затем при создании экземпляра генерируем setupContext и передаем этот объект в качестве второго аргумента при выполнении функции setup.

## expose

Когда вы дошли до этого момента, давайте попробуем реализовать SetupContext помимо emit.
В качестве примера на этот раз давайте реализуем expose.

expose - это функция, которая позволяет явно определять публичные свойства.
Давайте стремиться к интерфейсу разработчика, подобному следующему:

```ts
const Child = defineComponent({
  setup(_, { expose }) {
    const count = ref(0)
    const count2 = ref(0)
    expose({ count })
    return { count, count2 }
  },
  template: `<p>hello</p>`,
})

const Child2 = defineComponent({
  setup() {
    const count = ref(0)
    const count2 = ref(0)
    return { count, count2 }
  },
  template: `<p>hello</p>`,
})

const app = createApp({
  setup() {
    const child = ref()
    const child2 = ref()

    const log = () => {
      console.log(
        child.value.count,
        child.value.count2, // нет доступа
        child2.value.count,
        child2.value.count2,
      )
    }

    return () =>
      h('div', {}, [
        h(Child, { ref: child }, []),
        h(Child2, { ref: child2 }, []),
        h('button', { onClick: log }, ['log']),
      ])
  },
})
```

Для компонентов, которые не используют expose, все по-прежнему публично по умолчанию.

В качестве направления, давайте иметь объект под названием `exposed` внутри экземпляра, и если здесь установлено значение, мы передадим этот объект в ref для templateRef.

```ts
export interface ComponentInternalInstance {
  // .
  // .
  // .
  exposed: Record<string, any> | null // добавлено
}
```

Давайте реализуем функцию expose так, чтобы объекты могли быть зарегистрированы здесь.

## ProxyRefs

В этой главе мы реализовали proxy и exposedProxy, но на самом деле есть некоторые отличия от оригинального Vue.
А именно, "ref разворачивается". (В случае proxy, setupState имеет это свойство, а не proxy.)

Они реализованы с помощью ProxyRefs, и обработчик реализован под именем `shallowUnwrapHandlers`.
Это позволяет нам устранить избыточность значений, специфичных для ref, при написании шаблонов или работе с прокси.

```ts
const shallowUnwrapHandlers: ProxyHandler<any> = {
  get: (target, key, receiver) => unref(Reflect.get(target, key, receiver)),
  set: (target, key, value, receiver) => {
    const oldValue = target[key]
    if (isRef(oldValue) && !isRef(value)) {
      oldValue.value = value
      return true
    } else {
      return Reflect.set(target, key, value, receiver)
    }
  },
}
```

```vue
<template>
  <!-- <p>{{ count.value }}</p>  Нет необходимости писать так -->
  <p>{{ count }}</p>
</template>
```

Если вы реализуете это до этого момента, следующий код должен работать.

```ts
import { createApp, defineComponent, h, ref } from 'chibivue'

const Child = defineComponent({
  setup(_, { expose }) {
    const count = ref(0)
    const count2 = ref(0)
    expose({ count })
    return { count, count2 }
  },
  template: `<p>child {{ count }} {{ count2 }}</p>`,
})

const Child2 = defineComponent({
  setup() {
    const count = ref(0)
    const count2 = ref(0)
    return { count, count2 }
  },
  template: `<p>child2 {{ count }} {{ count2 }}</p>`,
})

const app = createApp({
  setup() {
    const child = ref()
    const child2 = ref()

    const increment = () => {
      child.value.count++
      child.value.count2++ // нет доступа
      child2.value.count++
      child2.value.count2++
    }

    return () =>
      h('div', {}, [
        h(Child, { ref: child }, []),
        h(Child2, { ref: child2 }, []),
        h('button', { onClick: increment }, ['increment']),
      ])
  },
})

app.mount('#app')
```

## Привязка шаблона и оператор with

На самом деле есть проблема с изменениями в этой главе.
Давайте попробуем запустить следующий код:

```ts
const Child2 = {
  setup() {
    const state = reactive({ count: 0 })
    return { state }
  },
  template: `<p>child2 count: {{ state.count }}</p>`,
}
```

Это просто простой код, но он не работает.
Он жалуется, что state не определен.

![state_is_not_defined](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/state_is_not_defined.png)

Причина этого в том, что при передаче Proxy в качестве аргумента оператору with должен быть определен has.

[Creating dynamic namespaces using the with statement and a proxy (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/with#creating_dynamic_namespaces_using_the_with_statement_and_a_proxy)

Итак, давайте реализуем has в PublicInstanceProxyHandlers.
Если ключ существует в setupState, props или ctx, он должен вернуть true.

```ts
export const PublicInstanceProxyHandlers: ProxyHandler<any> = {
  // .
  // .
  // .
  has(
    { _: { setupState, ctx, propsOptions } }: ComponentRenderContext,
    key: string,
  ) {
    let normalizedProps
    return (
      hasOwn(setupState, key) ||
      ((normalizedProps = propsOptions[0]) && hasOwn(normalizedProps, key)) ||
      hasOwn(ctx, key)
    )
  },
}
```

Если это работает правильно, все должно работать отлично!

Исходный код до этого момента:
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/40_basic_component_system/040_setup_context)
