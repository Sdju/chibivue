# Хуки жизненного цикла (Начало раздела Basic Component System)

## Давайте реализуем хуки жизненного цикла

Реализация хуков жизненного цикла очень проста.
Вам просто нужно зарегистрировать функции в ComponentInternalInstance и выполнить их в указанное время во время рендеринга.
Сам API будет реализован в runtime-core/apiLifecycle.ts.

Одна вещь, на которую стоит обратить внимание - это необходимость учитывать планирование для onMounted/onUnmounted/onUpdated.
Зарегистрированные функции должны выполняться после полного завершения монтирования, размонтирования и обновления.

Поэтому мы реализуем новый тип очереди под названием "post" в планировщике. Это то, что будет сброшено после завершения сброса существующей очереди.
Изображение ↓

```ts
const queue: SchedulerJob[] = [] // Существующая реализация
const pendingPostFlushCbs: SchedulerJob[] = [] // Новая очередь, которая будет создана на этот раз

function queueFlush() {
  queue.forEach(job => job())
  flushPostFlushCbs() // Сброс после сброса очереди
}
```

Также с этим давайте реализуем API, который добавляет в pendingPostFlushCbs.
И давайте используем его для добавления эффекта в рендерере в pendingPostFlushCbs.

Хуки жизненного цикла, которые будут поддерживаться на этот раз:

- onMounted
- onUpdated
- onUnmounted
- onBeforeMount
- onBeforeUpdate
- onBeforeUnmount

Давайте реализуем это, чтобы следующий код работал!

```ts
import {
  createApp,
  h,
  onBeforeMount,
  onBeforeUnmount,
  onBeforeUpdate,
  onMounted,
  onUnmounted,
  onUpdated,
  ref,
} from 'chibivue'

const Child = {
  setup() {
    const count = ref(0)
    onBeforeMount(() => {
      console.log('onBeforeMount')
    })

    onUnmounted(() => {
      console.log('onUnmounted')
    })

    onBeforeUnmount(() => {
      console.log('onBeforeUnmount')
    })

    onBeforeUpdate(() => {
      console.log('onBeforeUpdate')
    })

    onUpdated(() => {
      console.log('onUpdated')
    })

    onMounted(() => {
      console.log('onMounted')
    })

    return () =>
      h('div', {}, [
        h('p', {}, [`${count.value}`]),
        h('button', { onClick: () => count.value++ }, ['increment']),
      ])
  },
}

const app = createApp({
  setup() {
    const mountFlag = ref(true)

    return () =>
      h('div', {}, [
        h('button', { onClick: () => (mountFlag.value = !mountFlag.value) }, [
          'toggle',
        ]),
        mountFlag.value ? h(Child, {}, []) : h('p', {}, ['unmounted']),
      ])
  },
})

app.mount('#app')
```

Исходный код до этого момента:
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/40_basic_component_system/010_lifecycle_hooks)
