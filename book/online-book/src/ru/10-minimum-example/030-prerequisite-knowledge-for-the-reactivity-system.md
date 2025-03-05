# Предварительные знания для системы реактивности

## Интерфейс разработчика, к которому мы стремимся на этот раз

Отсюда мы будем говорить о сути Vue.js, которая является системой реактивности.  
Предыдущая реализация, хотя и выглядит похожей на Vue.js, на самом деле не является Vue.js с точки зрения функциональности.  
Я просто реализовал начальный интерфейс разработчика и сделал возможным отображение различного HTML.

Однако в таком виде, после рендеринга экрана, он остается неизменным, и как веб-приложение, оно становится просто статическим сайтом.  
Далее мы добавим состояние для создания более богатого пользовательского интерфейса и будем обновлять рендеринг при изменении состояния.

Сначала, как обычно, давайте подумаем, какой интерфейс разработчика это будет.  
Как насчет чего-то вроде этого?

```ts
import { createApp, h, reactive } from 'chibivue'

const app = createApp({
  setup() {
    const state = reactive({ count: 0 })

    const increment = () => {
      state.count++
    }

    return () =>
      h('div', { id: 'my-app' }, [
        h('p', {}, [`count: ${state.count}`]),
        h('button', { onClick: increment }, ['increment']),
      ])
  },
})

app.mount('#app')
```

Если вы привыкли разрабатывать с использованием однофайловых компонентов (SFC), это может выглядеть немного непривычно.  
Это интерфейс разработчика, который использует опцию `setup` для хранения состояния и возврата функции рендеринга.  
На самом деле, Vue.js имеет такую нотацию.

https://vuejs.org/api/composition-api-setup.html#usage-with-render-functions

Мы определяем состояние с помощью функции `reactive`, реализуем функцию с названием `increment`, которая изменяет его, и привязываем ее к событию клика кнопки.  
Резюмируя, что мы хотим сделать:

- Выполнить функцию `setup` для получения функции для получения vnode из возвращаемого значения
- Сделать объект, переданный функции `reactive`, реактивным
- Когда кнопка нажата, состояние обновляется
- Отслеживать обновления состояния, повторно выполнять функцию рендеринга и перерисовывать экран

## Что такое система реактивности?

Теперь давайте рассмотрим, что такое реактивность.  
Обратимся к официальной документации.

> Реактивные объекты - это прокси JavaScript, которые ведут себя как обычные объекты. Разница в том, что Vue может отслеживать доступ к свойствам и изменения в реактивных объектах.

[Источник](https://v3.vuejs.org/guide/reactivity-fundamentals.html)

> Одна из самых характерных особенностей Vue - это его скромная система реактивности. Состояние компонента состоит из реактивных объектов JavaScript. Когда состояние меняется, представление обновляется.

[Источник](https://v3.vuejs.org/guide/reactivity-in-depth.html)

В итоге, "реактивные объекты обновляют экран при изменениях".  
Давайте пока отложим вопрос о том, как этого достичь, и реализуем упомянутый ранее интерфейс разработчика.

## Реализация функции setup

То, что нам нужно сделать, очень просто.  
Мы получаем опцию `setup` и выполняем ее, а затем мы можем использовать ее так же, как предыдущую опцию `render`.

Редактируем `~/packages/runtime-core/componentOptions.ts`:

```ts
export type ComponentOptions = {
  render?: Function
  setup?: () => Function // Добавлено
}
```

Затем используем это:

```ts
// createAppAPI

const app: App = {
  mount(rootContainer: HostElement) {
    const componentRender = rootComponent.setup!()

    const updateComponent = () => {
      const vnode = componentRender()
      render(vnode, rootContainer)
    }

    updateComponent()
  },
}
```

```ts
// playground

import { createApp, h } from 'chibivue'

const app = createApp({
  setup() {
    // Определим состояние здесь в будущем
    // const state = reactive({ count: 0 })

    return function render() {
      return h('div', { id: 'my-app' }, [
        h('p', { style: 'color: red; font-weight: bold;' }, ['Hello world.']),
        h(
          'button',
          {
            onClick() {
              alert('Hello world!')
            },
          },
          ['click me!'],
        ),
      ])
    }
  },
})

app.mount('#app')
```

Ну, вот и все.  
На самом деле, мы хотим выполнять этот `updateComponent` при изменении состояния.

## Объекты Proxy

Это основная тема на этот раз. Я хочу каким-то образом выполнять `updateComponent` при изменении состояния.

Ключом к этому является объект, называемый Proxy.

Сначала позвольте мне объяснить о каждом из них, не о методе реализации системы реактивности.

https://developer.mozilla.org/ru/docs/Web/JavaScript/Reference/Global_Objects/Proxy

Proxy - это очень интересный объект.

Вы можете использовать его, передавая объект в качестве аргумента и используя `new` вот так:

```ts
const o = new Proxy({ value: 1 }, {})
console.log(o.value) // 1
```

В этом примере `o` ведет себя почти так же, как обычный объект.

Теперь, что интересно, Proxy может принимать второй аргумент и регистрировать обработчик.
Этот обработчик отвечает за операции с объектом. Пожалуйста, взгляните на следующий пример:

```ts
const o = new Proxy(
  { value: 1, value2: 2 },

  {
    get(target, key, receiver) {
      console.log(`target:${target}, key: ${key}`)
      return target[key]
    },
  },
)
```

В этом примере мы пишем настройки для сгенерированного объекта.
В частности, при доступе (get) к свойствам этого объекта, исходный объект (target) и доступное имя ключа будут выведены в консоль.
Давайте проверим работу в браузере или чем-то подобном.

![proxy_get](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/proxy_get.png)

Вы можете видеть, что выполняется обработка set, установленная для чтения значения из свойства объекта, сгенерированного этим Proxy.

Аналогично, вы также можете настроить его для set.

```ts
const o = new Proxy(
  { value: 1, value2: 2 },
  {
    set(target, key, value, receiver) {
      console.log('hello from setter')
      target[key] = value
      return true
    },
  },
)
```

![proxy_set](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/proxy_set.png)

Это степень понимания Proxy.

Исходный код до этого момента: \
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/10_minimum_example/030_knowledge_of_reactivity)

