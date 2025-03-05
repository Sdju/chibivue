# Hyper Ultimate Super Extreme Minimal Vue

## Настройка проекта (0.5 мин)

```sh
# Клонируйте этот репозиторий и перейдите в него.
git clone https://github.com/chibivue-land/chibivue
cd chibivue

# Создайте проект с помощью команды setup.
# Укажите корневой путь проекта в качестве аргумента.
nr setup ../my-chibivue-project
```

Настройка проекта завершена.

Теперь давайте реализуем packages/index.ts.

## createApp (1 мин)

Для функции create app давайте рассмотрим сигнатуру, которая позволяет указывать функции setup и render. С точки зрения пользователя, это будет использоваться так:

```ts
const app = createApp({
  setup() {
    // TODO:
  },
  render() {
    // TODO:
  },
})

app.mount('#app')
```

Давайте реализуем это:

```ts
type CreateAppOption = {
  setup: () => Record<string, unknown>
  render: (ctx: Record<string, unknown>) => VNode
}
```

Затем мы можем вернуть объект, который реализует функцию mount:

```ts
export const createApp = (option: CreateAppOption) => ({
  mount(selector: string) {
    const container = document.querySelector(selector)!
    // TODO: patch рендеринг
  },
})
```

На этом всё для этой части.

## Функция h и Virtual DOM (0.5 мин)

Для выполнения patch рендеринга нам нужен Virtual DOM и функции для его генерации.

Virtual DOM представляет имена тегов, атрибуты и дочерние элементы с помощью объектов JavaScript. Рендерер Vue обрабатывает Virtual DOM и применяет обновления к реальному DOM.

Давайте рассмотрим VNode, который представляет имя, обработчик события клика и дочерние элементы (текст) для этого примера:

```ts
type VNode = { tag: string; onClick: (e: Event) => void; children: string }
export const h = (
  tag: string,
  onClick: (e: Event) => void,
  children: string,
): VNode => ({ tag, onClick, children })
```

На этом всё для этой части.

## patch рендеринг (2 мин)

Теперь давайте реализуем рендерер.

Этот процесс рендеринга часто называют патчингом, потому что он сравнивает старый и новый Virtual DOM и применяет различия к реальному DOM.

Сигнатура функции будет такой:

```ts
export const render = (n1: VNode | null, n2: VNode, container: Element) => {
  // TODO:
}
```

n1 представляет старый VNode, n2 представляет новый VNode, а container - это корень реального DOM. В этом примере `#app` будет контейнером (элемент, смонтированный с помощью createApp).

Нам нужно рассмотреть два типа операций:

- Mount  
  Это начальный рендеринг. Если n1 равен null, это означает, что это первый рендеринг, поэтому нам нужно реализовать процесс монтирования.
- Patch  
  Это сравнивает VNodes и применяет различия к реальному DOM.  
  Однако в этот раз мы только обновляем дочерние элементы и не обнаруживаем различия.

Давайте реализуем это:

```ts
export const render = (n1: VNode | null, n2: VNode, container: Element) => {
  const mountElement = (vnode: VNode, container: Element) => {
    const el = document.createElement(vnode.tag)
    el.textContent = vnode.children
    el.addEventListener('click', vnode.onClick)
    container.appendChild(el)
  }
  const patchElement = (_n1: VNode, n2: VNode) => {
    ;(container.firstElementChild as Element).textContent = n2.children
  }
  n1 == null ? mountElement(n2, container) : patchElement(n1, n2)
}
```

На этом всё для этой части.

## Система реактивности (2 мин)

Теперь давайте реализуем логику для отслеживания изменений состояния, определенных в опции setup, и запуска функции render. Этот процесс отслеживания изменений состояния и выполнения определенных действий называется "Системой реактивности".

Давайте рассмотрим использование функции `reactive` для определения состояний:

```ts
const app = createApp({
  setup() {
    const state = reactive({ count: 0 })
    const increment = () => state.count++
    return { state, increment }
  },
  // ..
  // ..
})
```

В этом случае, когда состояние, определенное с помощью функции `reactive`, изменяется, мы хотим запустить процесс патчинга.

Это можно достичь с помощью объекта Proxy. Прокси позволяют нам реализовать функциональность для операций get/set. В этом случае мы можем использовать операцию set для выполнения процесса патчинга, когда происходит операция set.

```ts
export const reactive = <T extends Record<string, unknown>>(obj: T): T =>
  new Proxy(obj, {
    get: (target, key, receiver) => Reflect.get(target, key, receiver),
    set: (target, key, value, receiver) => {
      const res = Reflect.set(target, key, value, receiver)
      // ??? Здесь мы хотим выполнить процесс патчинга
      return res
    },
  })
```

Вопрос в том, что мы должны запустить в операции set? Обычно мы бы отслеживали изменения с помощью операции get, но в этом случае мы определим функцию `update` в глобальной области видимости и будем ссылаться на нее.

Давайте используем ранее реализованную функцию render для создания функции update:

```ts
let update: (() => void) | null = null // Мы хотим ссылаться на это с помощью Proxy, поэтому это должно быть в глобальной области видимости
export const createApp = (option: CreateAppOption) => ({
  mount(selector: string) {
    const container = document.querySelector(selector)!
    let prevVNode: VNode | null = null
    const setupState = option.setup() // Запускаем setup только при первом рендеринге
    update = () => {
      // Генерируем замыкание для сравнения prevVNode и VNode
      const vnode = option.render(setupState)
      render(prevVNode, vnode, container)
      prevVNode = vnode
    }
    update()
  },
})
```

Теперь нам просто нужно вызвать это в операции set прокси:

```ts
export const reactive = <T extends Record<string, unknown>>(obj: T): T =>
  new Proxy(obj, {
    get: (target, key, receiver) => Reflect.get(target, key, receiver),
    set: (target, key, value, receiver) => {
      const res = Reflect.set(target, key, value, receiver)
      update?.() // Выполняем обновление
      return res
    },
  })
```

Вот и всё!

## компилятор шаблонов (5 мин)

До сих пор мы могли реализовать декларативный UI, позволяя пользователям использовать опцию render и функцию h. Однако в реальности мы хотим писать это в HTML-подобном виде.

Поэтому давайте реализуем компилятор шаблонов, который преобразует HTML в функцию h.

Цель - преобразовать строку вида:

```
<button @click="increment">state: {{ state.count }}</button>
```

в функцию вида:

```
h("button", increment, "state: " + state.count)
```

Давайте разобьем это немного.

- parse  
  Разбираем HTML-строку и преобразуем ее в объект, называемый AST (Abstract Syntax Tree).
- codegen  
  Генерируем желаемый код (строку) на основе AST.

Теперь давайте реализуем AST и parse.

```ts
type AST = {
  tag: string
  onClick: string
  children: (string | Interpolation)[]
}
type Interpolation = { content: string }
```

AST, с которым мы имеем дело в этот раз, показан выше. Он похож на VNode, но он совершенно другой и используется для генерации кода. Interpolation представляет синтаксис mustache. Строка вида <span v-pre>`{{ state.count }}`</span> разбирается в объект (AST) вида <span v-pre>`{ content: "state.count" }`</span>.

Далее давайте реализуем функцию parse, которая генерирует AST из данной строки. Пока что давайте реализуем это быстро с помощью регулярных выражений и некоторых операций со строками.

```ts
const parse = (template: string): AST => {
  const RE = /<([a-z]+)\s@click=\"([a-z]+)\">(.+)<\/[a-z]+>/
  const [_, tag, onClick, children] = template.match(RE) || []
  if (!tag || !onClick || !children) throw new Error('Invalid template!')
  const regex = /{{(.*?)}}/g
  let match: RegExpExecArray | null
  let lastIndex = 0
  const parsedChildren: AST['children'] = []
  while ((match = regex.exec(children)) !== null) {
    lastIndex !== match.index &&
      parsedChildren.push(children.substring(lastIndex, match.index))
    parsedChildren.push({ content: match[1].trim() })
    lastIndex = match.index + match[0].length
  }
  lastIndex < children.length && parsedChildren.push(children.substr(lastIndex))
  return { tag, onClick, children: parsedChildren }
}
```

Далее идет codegen. Генерируем вызов функции h на основе AST.

```ts
const codegen = (node: AST) =>
  `(_ctx) => h('${node.tag}', _ctx.${node.onClick}, \`${node.children
    .map(child =>
      typeof child === 'object' ? `\$\{_ctx.${child.content}\}` : child,
    )
    .join('')}\`)`
```

Состояние ссылается из аргумента `_ctx`.

Объединяя это, мы можем завершить функцию compile.

```ts
const compile = (template: string): string => codegen(parse(template))
```

Ну, на самом деле, как есть, он только генерирует вызов функции h как строку, поэтому он еще не работает.

Мы реализуем это вместе с компилятором sfc.

С этим компилятор шаблонов завершен.

## sfc компилятор (vite-plugin) (4 мин)

Последнее! Давайте реализуем плагин для vite для поддержки sfc.

В плагинах vite есть опция transform, которая позволяет трансформировать содержимое файла.

Функция transform возвращает что-то вроде `{ code: string }`, и строка обрабатывается как исходный код. Другими словами, например,

```ts
export const VitePluginChibivue = () => ({
  name: "vite-plugin-chibivue",
  transform: (code: string, id: string) => ({
    code: "";
  }),
});
```

сделает содержимое всех файлов пустой строкой. Исходный код можно получить в качестве первого аргумента, поэтому, правильно преобразовав это значение и вернув его в конце, вы можете трансформировать его.

Нужно сделать 5 вещей.

- Извлечь то, что экспортируется по умолчанию из скрипта.
- Преобразовать его в код, который присваивает его переменной. (Для удобства давайте назовем переменную A.)
- Извлечь HTML-строку из шаблона и преобразовать ее в вызов функции h с помощью функции compile, которую мы создали ранее. (Для удобства давайте назовем результат B.)
- Сгенерировать код вида `Object.assign(A, { render: B })`.
- Сгенерировать код, который экспортирует A по умолчанию.

Теперь давайте реализуем это.

```ts
const compileSFC = (sfc: string): { code: string } => {
  const [_, scriptContent] =
    sfc.match(/<script>\s*([\s\S]*?)\s*<\/script>/) ?? []
  const [___, defaultExported] =
    scriptContent.match(/export default\s*([\s\S]*)/) ?? []
  const [__, templateContent] =
    sfc.match(/<template>\s*([\s\S]*?)\s*<\/template>/) ?? []
  if (!scriptContent || !defaultExported || !templateContent)
    throw new Error('Invalid SFC!')
  let code = ''
  code +=
    "import { h, reactive } from 'hyper-ultimate-super-extreme-minimal-vue';\n"
  code += `const options = ${defaultExported}\n`
  code += `Object.assign(options, { render: ${compile(templateContent)} });\n`
  code += 'export default options;\n'
  return { code }
}
```

После этого реализуем это в плагине.

```ts
export const VitePluginChibivue = () => ({
  name: 'vite-plugin-chibivue',
  transform: (code: string, id: string) =>
    id.endsWith('.vue') ? compileSFC(code) : code, // Только для файлов с расширением .vue
})
```

## Конец

Да. С этим мы успешно реализовали всё до SFC.
Давайте еще раз посмотрим на исходный код.

```ts
// create app api
type CreateAppOption = {
  setup: () => Record<string, unknown>
  render: (ctx: Record<string, unknown>) => VNode
}
let update: (() => void) | null = null
export const createApp = (option: CreateAppOption) => ({
  mount(selector: string) {
    const container = document.querySelector(selector)!
    let prevVNode: VNode | null = null
    const setupState = option.setup()
    update = () => {
      const vnode = option.render(setupState)
      render(prevVNode, vnode, container)
      prevVNode = vnode
    }
    update()
  },
})

// Virtual DOM patch
export const render = (n1: VNode | null, n2: VNode, container: Element) => {
  const mountElement = (vnode: VNode, container: Element) => {
    const el = document.createElement(vnode.tag)
    el.textContent = vnode.children
    el.addEventListener('click', vnode.onClick)
    container.appendChild(el)
  }
  const patchElement = (_n1: VNode, n2: VNode) => {
    ;(container.firstElementChild as Element).textContent = n2.children
  }
  n1 == null ? mountElement(n2, container) : patchElement(n1, n2)
}

// Virtual DOM
type VNode = { tag: string; onClick: (e: Event) => void; children: string }
export const h = (
  tag: string,
  onClick: (e: Event) => void,
  children: string,
): VNode => ({ tag, onClick, children })

// Система реактивности
export const reactive = <T extends Record<string, unknown>>(obj: T): T =>
  new Proxy(obj, {
    get: (target, key, receiver) => Reflect.get(target, key, receiver),
    set: (target, key, value, receiver) => {
      const res = Reflect.set(target, key, value, receiver)
      update?.()
      return res
    },
  })

// компилятор шаблонов
type AST = {
  tag: string
  onClick: string
  children: (string | Interpolation)[]
}
type Interpolation = { content: string }
const parse = (template: string): AST => {
  const RE = /<([a-z]+)\s@click=\"([a-z]+)\">(.+)<\/[a-z]+>/
  const [_, tag, onClick, children] = template.match(RE) || []
  if (!tag || !onClick || !children) throw new Error('Invalid template!')
  const regex = /{{(.*?)}}/g
  let match: RegExpExecArray | null
  let lastIndex = 0
  const parsedChildren: AST['children'] = []
  while ((match = regex.exec(children)) !== null) {
    lastIndex !== match.index &&
      parsedChildren.push(children.substring(lastIndex, match.index))
    parsedChildren.push({ content: match[1].trim() })
    lastIndex = match.index + match[0].length
  }
  lastIndex < children.length && parsedChildren.push(children.substr(lastIndex))
  return { tag, onClick, children: parsedChildren }
}
const codegen = (node: AST) =>
  `(_ctx) => h('${node.tag}', _ctx.${node.onClick}, \`${node.children
    .map(child =>
      typeof child === 'object' ? `\$\{_ctx.${child.content}\}` : child,
    )
    .join('')}\`)`
const compile = (template: string): string => codegen(parse(template))

// sfc компилятор (vite transformer)
export const VitePluginChibivue = () => ({
  name: 'vite-plugin-chibivue',
  transform: (code: string, id: string) =>
    id.endsWith('.vue') ? compileSFC(code) : null,
})
const compileSFC = (sfc: string): { code: string } => {
  const [_, scriptContent] =
    sfc.match(/<script>\s*([\s\S]*?)\s*<\/script>/) ?? []
  const [___, defaultExported] =
    scriptContent.match(/export default\s*([\s\S]*)/) ?? []
  const [__, templateContent] =
    sfc.match(/<template>\s*([\s\S]*?)\s*<\/template>/) ?? []
  if (!scriptContent || !defaultExported || !templateContent)
    throw new Error('Invalid SFC!')
  let code = ''
  code +=
    "import { h, reactive } from 'hyper-ultimate-super-extreme-minimal-vue';\n"
  code += `const options = ${defaultExported}\n`
  code += `Object.assign(options, { render: ${compile(templateContent)} });\n`
  code += 'export default options;\n'
  return { code }
}
```

Удивительно, но мы смогли реализовать это примерно в 110 строках. (Теперь никто не будет жаловаться, фух...)

Пожалуйста, обязательно попробуйте также основную часть основной части!! (Хотя это всего лишь приложение 😙)
