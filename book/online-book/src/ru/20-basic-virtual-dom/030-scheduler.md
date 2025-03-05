# Планировщик

## Планирование эффектов

Сначала посмотрите на этот код:

```ts
import { createApp, h, reactive } from 'chibivue'

const app = createApp({
  setup() {
    const state = reactive({
      message: 'Hello World',
    })
    const updateState = () => {
      state.message = 'Hello ChibiVue!'
      state.message = 'Hello ChibiVue!!'
    }

    return () => {
      console.log('😎 rendered!')

      return h('div', { id: 'app' }, [
        h('p', {}, [`message: ${state.message}`]),
        h('button', { onClick: updateState }, ['update']),
      ])
    }
  },
})

app.mount('#app')
```

Когда кнопка нажата, функция `set` вызывается дважды для `state.message`, поэтому естественно, функция `trigger` также будет выполнена дважды. Это означает, что Virtual DOM будет вычислен дважды и патчинг будет выполнен дважды.

![non_scheduled_effect](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/non_scheduled_effect.png)

Однако в реальности патчинг нужно выполнить только один раз, во время второго триггера.
Поэтому мы реализуем планировщик. Планировщик отвечает за управление порядком выполнения и контроль задач. Одна из ролей планировщика Vue - управление реактивными эффектами в очереди и их объединение, если это возможно.

## Планирование с управлением очередью

Конкретно, у нас будет очередь для управления задачами. У каждой задачи есть ID, и когда новая задача добавляется в очередь, если в очереди уже есть задача с таким же ID, она будет перезаписана.

```ts
export interface SchedulerJob extends Function {
  id?: number
}

const queue: SchedulerJob[] = []

export function queueJob(job: SchedulerJob) {
  if (
    !queue.length ||
    !queue.includes(job, isFlushing ? flushIndex + 1 : flushIndex)
  ) {
    if (job.id == null) {
      queue.push(job)
    } else {
      queue.splice(findInsertionIndex(job.id), 0, job)
    }
    queueFlush()
  }
}
```

Что касается ID задачи, в данном случае мы хотим группировать их по компонентам, поэтому мы присвоим уникальный идентификатор (UID) каждому компоненту и будем использовать их как ID задач.
UID - это просто идентификатор, получаемый путем увеличения счетчика.

## ReactiveEffect и Планировщик

В настоящее время ReactiveEffect имеет следующий интерфейс (частично опущено):

```ts
class ReactiveEffect {
  public fn: () => T,

  run() {}
}
```

С реализацией планировщика давайте внесем небольшое изменение.
В настоящее время мы регистрируем функцию в `fn` как эффект, но на этот раз давайте разделим их на "активно выполняемые эффекты" и "пассивно выполняемые эффекты".
Реактивные эффекты могут быть активно выполнены стороной, которая устанавливает эффект, или они могут быть пассивно выполнены, будучи вызванными некоторым внешним действием после добавления в зависимость (`dep`).
Для последнего типа эффекта, который добавляется в несколько `depsMap` и вызывается из нескольких источников, необходимо планирование (с другой стороны, если он явно вызывается активно, такое планирование не нужно).

Давайте рассмотрим конкретный пример. В функции `setupRenderEffect` рендерера у вас может быть следующая реализация:

```ts
const effect = (instance.effect = new ReactiveEffect(() => componentUpdateFn))
const update = (instance.update = () => effect.run())
update()
```

Созданный здесь `effect`, который является `reactiveEffect`, позже будет отслеживаться реактивным объектом при выполнении функции `setup`. Это явно требует реализации планирования (потому что он будет вызываться из разных мест).
Однако что касается вызываемой здесь функции `update()`, она должна просто выполнить эффект, поэтому планирование не нужно.
Вы можете подумать: "Разве мы не можем просто вызвать `componentUpdateFn` напрямую?" Но, пожалуйста, вспомните реализацию функции `run`. Просто вызов `componentUpdateFn` не устанавливает `activeEffect`.
Итак, давайте разделим "активно выполняемые эффекты" и "пассивно выполняемые эффекты (эффекты, требующие планирования)".

В качестве финального интерфейса в этой главе это будет выглядеть так:

```ts
// Первый аргумент ReactiveEffect - это активно выполняемый эффект, а второй - пассивно выполняемый эффект
const effect = (instance.effect = new ReactiveEffect(componentUpdateFn, () =>
  queueJob(update),
))
const update: SchedulerJob = (instance.update = () => effect.run())
update.id = instance.uid
update()
```

С точки зрения реализации, помимо `fn`, `ReactiveEffect` будет иметь функцию `scheduler`, и в функции `triggerEffect` планировщик будет выполняться первым, если он существует.

```ts
export type EffectScheduler = (...args: any[]) => any;

export class ReactiveEffect<T = any> {
  constructor(
    public fn: () => T,
    public scheduler: EffectScheduler | null = null
  );
}
```

```ts
function triggerEffect(effect: ReactiveEffect) {
  if (effect.scheduler) {
    effect.scheduler()
  } else {
    effect.run() // Если нет планировщика, выполняем эффект нормально
  }
}
```

---

Теперь давайте реализуем планирование с управлением очередью и классификацией эффектов, читая исходный код!

Исходный код до этого момента:
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/20_basic_virtual_dom/040_scheduler)

## Нам нужен nextTick

Если вы читали исходный код при реализации планировщика, вы могли заметить появление "nextTick" и задаться вопросом, используется ли он здесь. Сначала давайте поговорим о задаче, которую мы хотим решить на этот раз. Пожалуйста, взгляните на этот код:

```ts
import { createApp, h, reactive } from 'chibivue'

const app = createApp({
  setup() {
    const state = reactive({
      count: 0,
    })
    const updateState = () => {
      state.count++

      const p = document.getElementById('count-p')
      if (p) {
        console.log('😎 p.textContent', p.textContent)
      }
    }

    return () => {
      return h('div', { id: 'app' }, [
        h('p', { id: 'count-p' }, [`${state.count}`]),
        h('button', { onClick: updateState }, ['update']),
      ])
    }
  },
})

app.mount('#app')
```

Попробуйте нажать эту кнопку и посмотрите на консоль.

![old_state_dom](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/old_state_dom.png)

Несмотря на то, что мы выводим в консоль после обновления `state.count`, информация устарела. Это происходит потому, что DOM не обновляется мгновенно при обновлении состояния, и на момент вывода в консоль DOM все еще находится в старом состоянии.

Вот где появляется "nextTick".

https://vuejs.org/api/general.html#nexttick

"nextTick" - это API планировщика, который позволяет дождаться, пока изменения DOM будут применены планировщиком. Реализация "nextTick" очень проста. Она просто сохраняет задачу (promise), выполняемую в планировщике, и связывает ее с "then".

```ts
export function nextTick<T = void>(
  this: T,
  fn?: (this: T) => void,
): Promise<void> {
  const p = currentFlushPromise || resolvedPromise
  return fn ? p.then(this ? fn.bind(this) : fn) : p
}
```

Когда задача завершена (promise разрешен), выполняется callback, переданный в "nextTick". (Если в очереди нет задач, он связывается с "then" от "resolvedPromise") Естественно, сам "nextTick" также возвращает Promise, поэтому как интерфейс разработчика вы можете передать callback или await "nextTick".

```ts
import { createApp, h, reactive, nextTick } from 'chibivue'

const app = createApp({
  setup() {
    const state = reactive({
      count: 0,
    })
    const updateState = async () => {
      state.count++

      await nextTick() // Ждем
      const p = document.getElementById('count-p')
      if (p) {
        console.log('😎 p.textContent', p.textContent)
      }
    }

    return () => {
      return h('div', { id: 'app' }, [
        h('p', { id: 'count-p' }, [`${state.count}`]),
        h('button', { onClick: updateState }, ['update']),
      ])
    }
  },
})

app.mount('#app')
```

Теперь давайте фактически перепишем реализацию текущего планировщика, чтобы сохранить "currentFlushPromise" и реализовать "nextTick"!

Исходный код до этого момента:
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/20_basic_virtual_dom/050_next_tick)
