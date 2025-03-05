# Предварительные знания для SFC

## Необходимые знания

## Как реализован SFC?

Теперь давайте наконец начнем работу над поддержкой однофайловых компонентов (Single File Component, SFC).  
Итак, как нам следует подойти к его поддержке? SFC, как и шаблоны, используется во время разработки и не существует в рантайме.  
Для тех из вас, кто закончил разработку шаблона, я думаю, это просто вопрос того, как его скомпилировать.

Вам просто нужно преобразовать следующий SFC код:

```vue
<script>
export default {
  setup() {
    const state = reactive({ message: 'Hello, chibivue!' })
    const changeMessage = () => {
      state.message += '!'
    }

    return { state, changeMessage }
  },
}
</script>

<template>
  <div class="container" style="text-align: center">
    <h2>message: {{ state.message }}</h2>
    <img
      width="150px"
      src="https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Vue.js_Logo_2.svg/1200px-Vue.js_Logo_2.svg.png"
      alt="Vue.js Logo"
    />
    <p><b>chibivue</b> is the minimal Vue.js</p>

    <button @click="changeMessage">click me!</button>
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

в следующий JS код:

```ts
export default {
  setup() {
    const state = reactive({ message: 'Hello, chibivue!' })
    const changeMessage = () => {
      state.message += '!'
    }

    return { state, changeMessage }
  },

  render(_ctx) {
    return h('div', { class: 'container', style: 'text-align: center' }, [
      h('h2', `message: ${_ctx.state.message}`),
      h('img', {
        width: '150px',
        src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Vue.js_Logo_2.svg/1200px-Vue.js_Logo_2.svg.png',
      }),
      h('p', [h('b', 'chibivue'), ' is the minimal Vue.js']),
      h('button', { onClick: _ctx.changeMessage }, 'click me!'),
    ])
  },
}
```

Вы можете задаться вопросом о стилях! Но пока давайте забудем об этом и сосредоточимся на шаблоне и скрипте.\
Мы не будем рассматривать `script setup` в минимальном примере.

## Когда и как мы должны компилировать?

В заключение, "мы компилируем, когда инструмент сборки разрешает зависимости".
В большинстве случаев SFC импортируется и используется из других файлов.
В это время мы пишем плагин, который компилирует файл `.vue` при его разрешении и привязывает результат к приложению.

```ts
import App from './App.vue' // Компиляция происходит при импорте App.vue

const app = createApp(App)
app.mount('#app')
```

Существуют различные инструменты сборки, но в этот раз давайте попробуем написать плагин для Vite.

Поскольку может быть мало людей, которые никогда не писали плагин для Vite, давайте начнем с ознакомления с реализацией плагина, используя простой пример кода. Давайте создадим простой проект Vue.

```sh
pwd # ~
nlx create-vite
## ✔ Project name: … plugin-sample
## ✔ Select a framework: › Vue
## ✔ Select a variant: › TypeScript

cd plugin-sample
ni
```

Давайте посмотрим на файл vite.config.ts созданного проекта.

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
})
```

Вы можете видеть, что он добавляет `@vitejs/plugin-vue` в плагины.
На самом деле, при создании проекта Vue с помощью Vite, SFC может использоваться благодаря этому плагину.
Этот плагин реализует компилятор SFC в соответствии с API плагина Vite и компилирует файлы Vue в файлы JS.
Давайте попробуем создать простой плагин в этом проекте.

```ts
import { defineConfig, Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), myPlugin()],
})

function myPlugin(): Plugin {
  return {
    name: 'vite:my-plugin',

    transform(code, id) {
      if (id.endsWith('.sample.js')) {
        let result = ''

        for (let i = 0; i < 100; i++) {
          result += `console.log("HelloWorld from plugin! (${i})");\n`
        }

        result += code

        return { code: result }
      }
    },
  }
}
```

Я создал его с именем `myPlugin`.\
Поскольку он простой, я думаю, многие из вас могут понять его без объяснений, но я объясню на всякий случай.

Плагин соответствует формату, требуемому Vite. \
Есть различные опции, но поскольку это простой пример, я использовал только опцию `transform`.\
Я рекомендую проверить официальную документацию и другие ресурсы для получения дополнительной информации: https://vitejs.dev/guide/api-plugin.html

В функции `transform` вы можете получить `code` и `id`. \
Вы можете думать о `code` как о содержимом файла, а об `id` как об имени файла.\
В качестве возвращаемого значения вы помещаете результат в свойство `code`.
Вы можете написать различную обработку для каждого типа файла на основе `id` или изменить `code`, чтобы переписать содержимое файла.\
В данном случае я добавил 100 console.log в начало содержимого файла для файлов, заканчивающихся на `*.sample.js`.\
Теперь давайте реализуем пример `plugin.sample.js` и проверим его.

```sh
pwd # ~/plugin-sample
touch src/plugin.sample.js
```

`~/plugin-sample/src/plugin.sample.js`

```ts
function fizzbuzz(n) {
  for (let i = 1; i <= n; i++) {
    i % 3 === 0 && i % 5 === 0
      ? console.log('fizzbuzz')
      : i % 3 === 0
        ? console.log('fizz')
        : i % 5 === 0
          ? console.log('buzz')
          : console.log(i)
  }
}

fizzbuzz(Math.floor(Math.random() * 100) + 1)
```

`~/plugin-sample/src/main.ts`

```ts
import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import './plugin.sample.js' // добавлено

createApp(App).mount('#app')
```

Давайте проверим это в браузере.

```sh
pwd # ~/plugin-sample
nr dev
```

![sample_vite_plugin_console](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/sample_vite_plugin_console.png)

![sample_vite_plugin_source](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/sample_vite_plugin_source.png)

Вы можете видеть, что исходный код был правильно изменен.

Исходный код до этого момента:  
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/10_minimum_example/070_sfc_compiler)