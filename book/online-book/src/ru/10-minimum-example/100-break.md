# Сделаем перерыв

## Раздел минимального примера завершен!

В начале я упоминал, что эта книга разделена на несколько разделов, и первый раздел, "Раздел минимального примера", теперь завершен. Отличная работа 😁\
Если вас интересует Virtual DOM или патч-рендеринг, вы можете перейти к разделу Basic Virtual DOM. \
Если вы хотите расширить компоненты дальше, есть раздел Basic Component. Если вас интересуют более богатые выражения в шаблонах (такие как директивы), вы можете изучить раздел Basic Template Compiler. \
Если вас интересует script setup или макросы компилятора, вы можете перейти к разделу Basic SFC Compiler. (Конечно, вы можете сделать их все, если хотите!!)\
Прежде всего, "Раздел минимального примера" также является уважаемым разделом, поэтому если вы чувствуете, что "Мне не нужно знать слишком глубоко, но я хочу получить общее представление", тогда вам достаточно дойти до этого момента.

## Чего мы достигли до сих пор?

Наконец, давайте подумаем о том, что мы сделали и чего достигли в разделе минимального примера.

## Теперь мы знаем, на что смотрим и куда это относится

Во-первых, через начальный интерфейс разработчика под названием createApp, мы поняли, как (веб-приложение) разработчик и мир Vue связаны между собой.  
В частности, начиная с рефакторинга, который мы сделали в начале, вы теперь должны понимать основу структуры директорий Vue, ее зависимости и где работают разработчики.  
Давайте сравним текущую директорию и директорию vuejs/core.

chibivue
![minimum_example_artifacts](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/minimum_example_artifacts.png)

\*Оригинальный код слишком большой, чтобы поместиться на скриншоте, поэтому он опущен.

https://github.com/vuejs/core

Несмотря на то, что он маленький, теперь вы должны быть в состоянии читать и понимать роли и содержимое каждого файла в некоторой степени. \
Я надеюсь, что вы также попробуете читать исходный код частей, которые мы не рассмотрели в этот раз. (Вы должны быть в состоянии читать его понемногу!)

## Теперь мы знаем, как достигается декларативный UI

Через реализацию функции h, мы поняли, как достигается декларативный UI.

```ts
// Внутренне он генерирует объект вроде {tag, props, children} и выполняет операции DOM на его основе
h('div', { id: 'my-app' }, [
  h('p', {}, ['Hello!']),
  h(
    'button',
    {
      onClick: () => {
        alert('hello')
      },
    },
    ['Click me!'],
  ),
])
```

Здесь впервые появляется что-то вроде Virtual DOM.

## Теперь мы знаем, что такое система реактивности и как динамически обновлять экран

Мы поняли реализацию уникальной функции Vue, системы реактивности, как она работает и что она на самом деле представляет собой.

```ts
const targetMap = new WeakMap<any, KeyToDepMap>()

function reactive<T extends object>(target: T): T {
  const proxy = new Proxy(target, {
    get(target: object, key: string | symbol, receiver: object) {
      track(target, key)
      return Reflect.get(target, key, receiver)
    },

    set(
      target: object,
      key: string | symbol,
      value: unknown,
      receiver: object,
    ) {
      Reflect.set(target, key, value, receiver)
      trigger(target, key)
      return true
    },
  })
}
```

```ts
const component = {
  setup() {
    const state = reactive({ count: 0 }) // создать прокси

    const increment = () => {
      state.count++ // trigger
    }

    ;() => {
      return h('p', {}, `${state.count}`) // track
    }
  },
}
```

## Теперь мы знаем, что такое Virtual DOM, почему он полезен и как его реализовать

В качестве улучшения рендеринга с использованием функции h, мы поняли эффективный метод рендеринга с использованием Virtual DOM через сравнение.

```ts
// Интерфейс для Virtual DOM
export interface VNode<HostNode = any> {
  type: string | typeof Text | object
  props: VNodeProps | null
  children: VNodeNormalizedChildren
  el: HostNode | undefined
}

// Сначала вызывается функция рендеринга
const render: RootRenderFunction = (rootComponent, container) => {
  const vnode = createVNode(rootComponent, {}, [])
  // В первый раз n1 равен null. В этом случае каждый процесс выполняет mount
  patch(null, vnode, container)
}

const patch = (n1: VNode | null, n2: VNode, container: RendererElement) => {
  const { type } = n2
  if (type === Text) {
    processText(n1, n2, container)
  } else if (typeof type === 'string') {
    processElement(n1, n2, container)
  } else if (typeof type === 'object') {
    processComponent(n1, n2, container)
  } else {
    // ничего не делать
  }
}

// Со второго раза и далее предыдущий VNode и текущий VNode передаются в функцию patch для обновления различий
const nextVNode = component.render()
patch(prevVNode, nextVNode)
```

Я понял, как достигается структура компонентов и взаимодействие между компонентами.

```ts
export interface ComponentInternalInstance {
  type: Component

  vnode: VNode
  subTree: VNode
  next: VNode | null
  effect: ReactiveEffect
  render: InternalRenderFunction
  update: () => void

  propsOptions: Props
  props: Data
  emit: (event: string, ...args: any[]) => void

  isMounted: boolean
}
```

```ts
const MyComponent = {
  props: { someMessage: { type: String } },

  setup(props: any, { emit }: any) {
    return () =>
      h('div', {}, [
        h('p', {}, [`someMessage: ${props.someMessage}`]),
        h('button', { onClick: () => emit('click:change-message') }, [
          'change message',
        ]),
      ])
  },
}

const app = createApp({
  setup() {
    const state = reactive({ message: 'hello' })
    const changeMessage = () => {
      state.message += '!'
    }

    return () =>
      h('div', { id: 'my-app' }, [
        h(
          MyComponent,
          {
            'some-message': state.message,
            'onClick:change-message': changeMessage,
          },
          [],
        ),
      ])
  },
})
```

Я понял, что такое компилятор и как реализована функциональность шаблона.

Понимая, что такое компилятор и реализуя компилятор шаблонов, я получил понимание того, как достичь более сырой реализации, похожей на HTML, и как реализовать специфичные для Vue функции, такие как синтаксис Mustache.

```ts
const app = createApp({
  setup() {
    const state = reactive({ message: 'Hello, chibivue!', input: '' })

    const changeMessage = () => {
      state.message += '!'
    }

    const handleInput = (e: InputEvent) => {
      state.input = (e.target as HTMLInputElement)?.value ?? ''
    }

    return { state, changeMessage, handleInput }
  },

  template: `
    <div class="container" style="text-align: center">
      <h2>{{ state.message }}</h2>
      <img
        width="150px"
        src="https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Vue.js_Logo_2.svg/1200px-Vue.js_Logo_2.svg.png"
        alt="Vue.js Logo"
      />
      <p><b>chibivue</b> is the minimal Vue.js</p>

      <button @click="changeMessage"> click me! </button>

      <br />

      <label>
        Input Data
        <input @input="handleInput" />
      </label>

      <p>input value: {{ state.input }}</p>

      <style>
        .container {
          height: 100vh;
          padding: 16px;
          background-color: #becdbe;
          color: #2c3e50;
        }
      </style>
    </div>
  `,
})
```

Я понял, как достичь компилятора SFC через плагин Vite.

Реализуя компилятор шаблонов и используя его через плагин Vite, я получил понимание того, как реализовать оригинальный формат файла, который объединяет скрипт, шаблон и стиль в один файл.\
Я также узнал о том, что можно сделать с плагинами Vite, а также о transform и виртуальных модулях.

```vue
<script>
import { reactive } from 'chibivue'

export default {
  setup() {
    const state = reactive({ message: 'Hello, chibivue!', input: '' })

    const changeMessage = () => {
      state.message += '!'
    }

    const handleInput = e => {
      state.input = e.target?.value ?? ''
    }

    return { state, changeMessage, handleInput }
  },
}
</script>

<template>
  <div class="container" style="text-align: center">
    <h2>{{ state.message }}</h2>
    <img
      width="150px"
      src="https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Vue.js_Logo_2.svg/1200px-Vue.js_Logo_2.svg.png"
      alt="Vue.js Logo"
    />
    <p><b>chibivue</b> is the minimal Vue.js</p>

    <button @click="changeMessage">click me!</button>

    <br />

    <label>
      Input Data
      <input @input="handleInput" />
    </label>

    <p>input value: {{ state.input }}</p>
  </div>
</template>

<style>
.container {
  height: 100vh;
  padding: 16px;
  background-color: #becdbe;
  color: #2c3e50;
}
</style>
```

## О будущем

Отныне, чтобы сделать его более практичным, мы углубимся в детали каждой части.  
Я объясню немного о том, что делать и как продолжать (политика) для каждой части.

### Что делать

Отсюда он будет разделен на 5 частей + 1 приложение.

- Часть Basic Virtual DOM
  - Реализация планировщика
  - Реализация неподдерживаемых патчей (в основном связанных с атрибутами)
  - Поддержка Fragment
- Часть Basic Reactivity System
  - API ref
  - API computed
  - API watch
- Часть Basic Component System
  - provide/inject
  - хуки жизненного цикла
- Часть Basic Template Compiler
  - v-on
  - v-bind
  - v-for
  - v-model
- Часть Basic SFC Compiler
  - Основы SFC
  - script setup
  - макросы компилятора
- Часть Web Application Essentials (Приложение)

Эта часть является приложением. \
В этой части мы реализуем библиотеки, которые часто используются вместе с Vue в веб-разработке. 

- store
- route

Мы рассмотрим вышеуказанные два, но не стесняйтесь реализовывать другие вещи, которые приходят в голову!

### Политика

В части минимального примера мы объяснили шаги реализации довольно подробно. \
К настоящему времени, если вы реализовали это, вы должны быть в состоянии читать исходный код оригинального Vue. 
Поэтому, отныне, объяснения будут придерживаться грубой политики, и вы будете реализовывать фактический код, читая оригинальный код или думая самостоятельно. \
(Н-нет, это не потому, что мне лень писать подробно или что-то в этом роде!) \
Ну, это весело реализовывать так, как говорит книга, но как только она начинает принимать форму, веселее делать это самостоятельно, и это ведет к более глубокому пониманию. \
Отсюда, пожалуйста, рассматривайте эту книгу как своего рода руководство, а основное содержание находится в исходном коде оригинального Vue!
