# Пробуем реализовать небольшую систему реактивности

## Механизм реактивности с использованием Proxy

::: info Различия в дизайне по сравнению с текущим `vuejs/core`
По состоянию на декабрь 2024 года система реактивности Vue.js использует шаблон наблюдателя на основе двусвязного списка.\
Эта реализация, представленная в [Refactor reactivity system to use version counting and doubly-linked list tracking](https://github.com/vuejs/core/pull/10397), значительно способствовала улучшению производительности.  

Однако для тех, кто впервые реализует систему реактивности, это может быть несколько сложно для понимания. В этой главе мы создадим упрощенную реализацию традиционной (до оптимизации) системы.\
Для более подробного объяснения системы, более близкой к текущей реализации, обратитесь к [Оптимизация реактивности](/30-basic-reactivity-system/005-reactivity-optimization).  

Еще одно значительное улучшение, [feat(reactivity): more efficient reactivity system](https://github.com/vuejs/core/pull/5912), будет рассмотрено в отдельной главе.  
:::

Чтобы еще раз прояснить цель, целью на этот раз является "выполнение `updateComponent` при изменении состояния". Давайте я объясню процесс реализации с использованием Proxy.

Во-первых, система реактивности Vue.js включает в себя `target`, `Proxy`, `ReactiveEffect`, `Dep`, `track`, `trigger`, `targetMap` и `activeEffect` (в настоящее время `activeSub`).

Сначала поговорим о структуре targetMap.
targetMap - это отображение ключей и deps для определенного target.
Target относится к объекту, который вы хотите сделать реактивным, а dep относится к эффекту (функции), который вы хотите выполнить. Можно так об этом думать.
В коде это выглядит так:

```ts
type Target = any // любая цель
type TargetKey = any // любой ключ, который имеет цель

const targetMap = new WeakMap<Target, KeyToDepMap>() // определено как глобальная переменная в этом модуле

type KeyToDepMap = Map<TargetKey, Dep> // карта ключа цели и эффекта

type Dep = Set<ReactiveEffect> // dep имеет несколько ReactiveEffects

class ReactiveEffect {
  constructor(
    // здесь вы даете функцию, которую хотите фактически применить как эффект (в данном случае, updateComponent)
    public fn: () => T,
  ) {}
}
```

Это означает регистрацию "определенного эффекта" для "определенного ключа" "определенной цели (объекта)".

Возможно, трудно понять только глядя на код, поэтому вот конкретный пример и дополнительная диаграмма.\
Рассмотрим компонент, подобный следующему:

```ts
export default defineComponent({
  setup() {
    const state1 = reactive({ name: "John", age: 20 })
    const state2 = reactive({ count: 0 })

    function onCountUpdated() {
      console.log("count updated")
    }

    watch(() => state2.count, onCountUpdated)

    return () => h("p", {}, `name: ${state1.name}`)
  }
})
```

Хотя мы еще не реализовали `watch` в этой главе, он написан здесь для иллюстрации.\
В этом компоненте targetMap в конечном итоге будет сформирован следующим образом.

![target_map](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/target_map.drawio.png)

Ключом targetMap является "определенная цель". В этом примере state1 и state2 соответствуют этому.\
Ключи, которые имеют эти цели, становятся ключами targetMap.\
Эффекты, связанные с ними, становятся значениями.

В части `() => h("p", {}, name: ${state1.name})` регистрируется отображение `state1->name->updateComponentFn`, а в части `watch(() => state2.count, onCountUpdated)` регистрируется отображение `state2->count->onCountUpdated`.

Эта базовая структура отвечает за остальное, а затем мы думаем о том, как создать (зарегистрировать) targetMap и как выполнить эффект.

Вот где появляются концепции `track` и `trigger`.
Как следует из названий, `track` - это функция, которая регистрирует в `targetMap`, а `trigger` - это функция, которая извлекает эффект из `targetMap` и выполняет его.

```ts
export function track(target: object, key: unknown) {
  // ..
}

export function trigger(target: object, key?: unknown) {
  // ..
}
```

И эти `track` и `trigger` реализованы в обработчиках get и set Proxy.

```ts
const state = new Proxy(
  { count: 1 },
  {
    get(target, key, receiver) {
      track(target, key)
      return target[key]
    },
    set(target, key, value, receiver) {
      target[key] = value
      trigger(target, key)
      return true
    },
  },
)
```

API для генерации этого Proxy - это функция reactive.

```ts
function reactive<T>(target: T) {
  return new Proxy(target, {
    get(target, key, receiver) {
      track(target, key)
      return target[key]
    },
    set(target, key, value, receiver) {
      target[key] = value
      trigger(target, key)
      return true
    },
  })
}
```

![reactive](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/reactive.drawio.png)

Здесь вы можете заметить один отсутствующий элемент. То есть, "какую функцию регистрировать в track?".
Ответ - это концепция `activeEffect`.
Это также определено как глобальная переменная в этом модуле, так же как и targetMap, и устанавливается в методе `run` ReactiveEffect.

```ts
let activeEffect: ReactiveEffect | undefined

class ReactiveEffect {
  constructor(
    // здесь вы даете функцию, которую хотите фактически применить как эффект (в данном случае, updateComponent)
    public fn: () => T,
  ) {}

  run() {
    activeEffect = this
    return this.fn()
  }
}
```

Чтобы понять, как это работает, представьте компонент, подобный этому.

```ts
{
  setup() {
    const state = reactive({ count: 0 });
    const increment = () => state.count++;

    return function render() {
      return h("div", { id: "my-app" }, [
        h("p", {}, [`count: ${state.count}`]),
        h(
          "button",
          {
            onClick: increment,
          },
          ["increment"]
        ),
      ]);
    };
  },
}
```

Внутренне реактивность формируется так.

```ts
// Реализация внутри chibivue
const app: App = {
  mount(rootContainer: HostElement) {
    const componentRender = rootComponent.setup!()

    const updateComponent = () => {
      const vnode = componentRender()
      render(vnode, rootContainer)
    }

    const effect = new ReactiveEffect(updateComponent)
    effect.run()
  },
}
```

Объясним по шагам, сначала выполняется функция `setup`.\
В этот момент генерируется реактивный прокси. Другими словами, любая операция, выполняемая с прокси, созданным здесь, будет вести себя так, как настроено в прокси.

```ts
const state = reactive({ count: 0 }) // Генерация прокси
```

Далее мы передаем `updateComponent` для создания `ReactiveEffect` (сторона наблюдателя).

```ts
const effect = new ReactiveEffect(updateComponent)
```

`componentRender`, используемый в `updateComponent`, - это функция, которая является `возвращаемым значением` `setup`, и эта функция ссылается на объект, созданный прокси.

```ts
function render() {
  return h('div', { id: 'my-app' }, [
    h('p', {}, [`count: ${state.count}`]), // Ссылка на объект, созданный прокси
    h(
      'button',
      {
        onClick: increment,
      },
      ['increment'],
    ),
  ])
}
```

Когда эта функция фактически выполняется, выполняется функция `getter` `state.count`, и запускается `track`. 
В этой ситуации давайте выполним эффект.

```ts
effect.run()
```

Затем `updateComponent` (ReactiveEffect с `updateComponent`) устанавливается как `activeEffect`. 
Когда в этом состоянии запускается `track`, карта `state.count` и `updateComponent` (ReactiveEffect с `updateComponent`) регистрируется в `targetMap`. 
Так формируется реактивность.

Теперь давайте рассмотрим, что происходит, когда выполняется `increment`. 
Поскольку `increment` переписывает `state.count`, выполняется `setter`, и запускается `trigger`. 
`trigger` находит и выполняет `effect` (в данном случае, updateComponent) из `targetMap` на основе `state` и `count`. 
Так запускается обновление экрана!

Это позволяет нам достичь реактивности.

Это немного сложно, поэтому давайте подведем итог на диаграмме.

![reactivity_create](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/reactivity_create.drawio.png)

## На основе этого давайте реализуем.

Самая сложная часть - понять все до этого момента, поэтому, как только вы поймете, все, что вам нужно сделать, это написать исходный код.
Однако, даже если вы понимаете только вышеизложенное, могут быть люди, которые не могут понять без знания того, что на самом деле происходит.
Для таких людей давайте попробуем реализовать это здесь сначала. Затем, читая актуальный код, пожалуйста, возвращайтесь к предыдущему разделу!

Сначала давайте создадим необходимые файлы. Мы создадим их в `packages/reactivity`.
Здесь мы постараемся как можно больше соответствовать конфигурации оригинального Vue.

```sh
pwd # ~
mkdir packages/reactivity

touch packages/reactivity/index.ts

touch packages/reactivity/dep.ts
touch packages/reactivity/effect.ts
touch packages/reactivity/reactive.ts
touch packages/reactivity/baseHandler.ts
```

Как обычно, `index.ts` просто экспортирует, поэтому я не буду подробно объяснять. Экспортируйте здесь то, что вы хотите использовать из внешнего пакета reactivity.

Далее идет `dep.ts`.

```ts
import { type ReactiveEffect } from './effect'

export type Dep = Set<ReactiveEffect>

export const createDep = (effects?: ReactiveEffect[]): Dep => {
  const dep: Dep = new Set<ReactiveEffect>(effects)
  return dep
}
```

Еще нет определения `effect`, но мы реализуем его позже, так что все в порядке.

Следующий файл - `effect.ts`.

```ts
import { Dep, createDep } from './dep'

type KeyToDepMap = Map<any, Dep>
const targetMap = new WeakMap<any, KeyToDepMap>()

export let activeEffect: ReactiveEffect | undefined

export class ReactiveEffect<T = any> {
  constructor(public fn: () => T) {}

  run() {
    // ※ Сохраняем activeEffect перед выполнением fn и восстанавливаем его после выполнения.
    // Если не сделать этого, он будет переопределяться один за другим и вести себя непредсказуемо. (Давайте восстановим его до исходного состояния, когда закончите)
    let parent: ReactiveEffect | undefined = activeEffect
    activeEffect = this
    const res = this.fn()
    activeEffect = parent
    return res
  }
}

export function track(target: object, key: unknown) {
  let depsMap = targetMap.get(target)
  if (!depsMap) {
    targetMap.set(target, (depsMap = new Map()))
  }

  let dep = depsMap.get(key)
  if (!dep) {
    depsMap.set(key, (dep = createDep()))
  }

  if (activeEffect) {
    dep.add(activeEffect)
  }
}

export function trigger(target: object, key?: unknown) {
  const depsMap = targetMap.get(target)
  if (!depsMap) return

  const dep = depsMap.get(key)

  if (dep) {
    const effects = [...dep]
    for (const effect of effects) {
      effect.run()
    }
  }
}
```

Я не объяснял содержимое `track` и `trigger` до сих пор, но они просто регистрируют и извлекают из `targetMap` и выполняют их, поэтому, пожалуйста, попробуйте внимательно прочитать их.

Далее идет `baseHandler.ts`. Здесь мы определяем обработчик для реактивного прокси.
Ну, вы можете реализовать его непосредственно в `reactive`, но я следовал оригинальному Vue, потому что это так.
В реальности существуют различные прокси, такие как `readonly` и `shallow`, поэтому идея заключается в том, чтобы реализовать обработчики для этих прокси здесь. (Мы не будем делать это на этот раз, хотя)

```ts
import { track, trigger } from './effect'
import { reactive } from './reactive'

export const mutableHandlers: ProxyHandler<object> = {
  get(target: object, key: string | symbol, receiver: object) {
    track(target, key)

    const res = Reflect.get(target, key, receiver)
    // Если это объект, делаем его реактивным (это позволяет вложенным объектам также быть реактивными).
    if (res !== null && typeof res === 'object') {
      return reactive(res)
    }

    return res
  },

  set(target: object, key: string | symbol, value: unknown, receiver: object) {
    let oldValue = (target as any)[key]
    Reflect.set(target, key, value, receiver)
    // проверяем, изменилось ли значение
    if (hasChanged(value, oldValue)) {
      trigger(target, key)
    }
    return true
  },
}

const hasChanged = (value: any, oldValue: any): boolean =>
  !Object.is(value, oldValue)
```

Здесь появляется `Reflect`, который похож на `Proxy`, но в то время как `Proxy` предназначен для записи мета-настроек для объектов, `Reflect` предназначен для выполнения операций над существующими объектами.
И `Proxy`, и `Reflect` - это API для мета-программирования, связанного с объектами в JS-движке, и они позволяют выполнять мета-операции по сравнению с обычным использованием объектов.
Вы можете выполнять функции, которые изменяют объект, выполнять функции, которые читают объект, и проверять, существует ли ключ, и выполнять различные мета-операции.
На данный момент достаточно понимать, что `Proxy` предназначен для мета-настроек на этапе создания объекта, а `Reflect` - для мета-операций над существующими объектами.

Далее идет `reactive.ts`.

```ts
import { mutableHandlers } from './baseHandler'

export function reactive<T extends object>(target: T): T {
  const proxy = new Proxy(target, mutableHandlers)
  return proxy as T
}
```

Теперь, когда реализация `reactive` завершена, давайте попробуем использовать их при монтировании.
`~/packages/runtime-core/apiCreateApp.ts`.

```ts
import { ReactiveEffect } from '../reactivity'

export function createAppAPI<HostElement>(
  render: RootRenderFunction<HostElement>,
): CreateAppFunction<HostElement> {
  return function createApp(rootComponent) {
    const app: App = {
      mount(rootContainer: HostElement) {
        const componentRender = rootComponent.setup!()

        const updateComponent = () => {
          const vnode = componentRender()
          render(vnode, rootContainer)
        }

        // Отсюда
        const effect = new ReactiveEffect(updateComponent)
        effect.run()
        // До сюда
      },
    }

    return app
  }
}
```

Теперь давайте попробуем это в playground.

```ts
import { createApp, h, reactive } from 'chibivue'

const app = createApp({
  setup() {
    const state = reactive({ count: 0 })
    const increment = () => {
      state.count++
    }

    return function render() {
      return h('div', { id: 'my-app' }, [
        h('p', {}, [`count: ${state.count}`]),
        h('button', { onClick: increment }, ['increment']),
      ])
    }
  },
})

app.mount('#app')
```

Упс...

Рендеринг сейчас работает нормально, но что-то кажется не так.
Ну, это не удивительно, потому что в `updateComponent` мы создаем элементы каждый раз.
Итак, давайте удалим все элементы перед каждым рендерингом.

![reactive_example_mistake](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/reactive_example_mistake.png)

Изменим функцию `render` в `~/packages/runtime-core/renderer.ts` так:

```ts
const render: RootRenderFunction = (vnode, container) => {
  while (container.firstChild) container.removeChild(container.firstChild) // Добавляем код для удаления всех элементов
  const el = renderVNode(vnode)
  hostInsert(el, container)
}
```

Теперь, как насчет этого?

![reactive_example](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/reactive_example.png)

Теперь, кажется, все работает нормально!

Теперь мы можем обновлять экран с помощью `reactive`!

Исходный код до этого момента: [GitHub](https://github.com/chibivue-land/chibivue/tree/main/book/impls/10_minimum_example/030_reactive_system)
