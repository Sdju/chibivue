# Разрешение компонентов

На самом деле, наш шаблон chibivue пока не может разрешать компоненты.
Давайте реализуем это здесь, так как Vue.js предоставляет несколько способов разрешения компонентов.

Сначала давайте рассмотрим некоторые из методов разрешения.

## Методы разрешения компонентов

### 1. Опция Components (Локальная регистрация)

Это, вероятно, самый простой способ разрешения компонентов.

https://vuejs.org/api/options-misc.html#components

```vue
<script>
import MyComponent from './MyComponent.vue'

export default {
  components: {
    MyComponent,
    MyComponent2: MyComponent,
  },
}
</script>

<template>
  <MyComponent />
  <MyComponent2 />
</template>
```

Имена ключей, указанные в объекте components, становятся именами компонентов, которые можно использовать в шаблоне.

### 2. Регистрация в приложении (Глобальная регистрация)

Вы можете зарегистрировать компоненты, которые можно использовать во всем приложении, используя метод `.component()` созданного приложения Vue.

https://vuejs.org/guide/components/registration.html#global-registration

```ts
import { createApp } from 'vue'

const app = createApp({})

app
  .component('ComponentA', ComponentA)
  .component('ComponentB', ComponentB)
  .component('ComponentC', ComponentC)
```

### 3. Динамические компоненты + атрибут is

Используя атрибут is, вы можете динамически переключать компоненты.

https://vuejs.org/api/built-in-special-elements.html#component

```vue
<script>
import Foo from './Foo.vue'
import Bar from './Bar.vue'

export default {
  components: { Foo, Bar },
  data() {
    return {
      view: 'Foo',
    }
  },
}
</script>

<template>
  <component :is="view" />
</template>
```

### 4. Импорт во время script setup

В script setup вы можете напрямую использовать импортированные компоненты.

```vue
<script setup>
import MyComponent from './MyComponent.vue'
</script>

<template>
  <MyComponent />
</template>
```

Кроме того, существуют также асинхронные компоненты, встроенные компоненты и тег `component`, но в этот раз мы попробуем обработать только два вышеуказанных способа (1, 2).

Что касается 3, если 1 и 2 могут с этим справиться, это просто расширение. Что касается 4, поскольку script setup еще не реализован, мы пока отложим его.

## Базовый подход

Базовый подход к разрешению компонентов следующий:

- Где-то хранить имена и записи компонентов, используемых в шаблоне.
- Использовать вспомогательные функции для разрешения компонентов на основе их имен.

И форма 1, и форма 2 просто хранят имена и записи компонентов, единственная разница в том, где они регистрируются.  
Если у вас есть записи, вы можете разрешать компоненты из имен при необходимости, поэтому обе реализации будут похожи.

Сначала давайте посмотрим на ожидаемый код и результат компиляции.

```vue
<script>
import MyComponent from './MyComponent.vue'

export default defineComponent({
  components: { MyComponent },
})
</script>

<template>
  <MyComponent />
</template>
```

```js
// Результат компиляции

function render(_ctx) {
  const {
    resolveComponent: _resolveComponent,
    createVNode: _createVNode,
    Fragment: _Fragment,
  } = ChibiVue

  const _component_MyComponent = _resolveComponent('MyComponent')

  return _createVNode(_Fragment, null, _createVNode(_component_MyComponent))
}
```

Выглядит вот так.

## Реализация

### AST

Чтобы сгенерировать код, который разрешает компоненты, нам нужно знать, что "MyComponent" является компонентом.  
На этапе парсинга мы обрабатываем имя тега и разделяем его на обычный Element и Component в AST.

Сначала давайте рассмотрим определение AST.  
ComponentNode, как и обычный Element, имеет props и children.  
Объединяя эти общие части как `BaseElementNode`, мы переименуем существующий `ElementNode` в `PlainElementNode`,  
и сделаем `ElementNode` объединением `PlainElementNode` и `ComponentNode`.

```ts
// compiler-core/ast.ts

export const enum ElementTypes {
  ELEMENT,
  COMPONENT,
}

export type ElementNode = PlainElementNode | ComponentNode

export interface BaseElementNode extends Node {
  type: NodeTypes.ELEMENT
  tag: string
  tagType: ElementTypes
  isSelfClosing: boolean
  props: Array<AttributeNode | DirectiveNode>
  children: TemplateChildNode[]
}

export interface PlainElementNode extends BaseElementNode {
  tagType: ElementTypes.ELEMENT
  codegenNode: VNodeCall | SimpleExpressionNode | undefined
}

export interface ComponentNode extends BaseElementNode {
  tagType: ElementTypes.COMPONENT
  codegenNode: VNodeCall | undefined
}
```

Содержимое то же самое, что и раньше, но мы различаем их по `tagType` и обрабатываем как отдельные AST.  
Мы будем использовать это на этапе transform для добавления вспомогательных функций и т.д.

### Parser

Далее давайте реализуем парсер для генерации вышеуказанного AST.  
В основном нам просто нужно определить `tagType` на основе имени тега.

Проблема в том, как определить, является ли это Element или Component.

Базовая идея проста: просто определить, является ли это "нативным тегом" или нет.

・  
・  
・

"Подождите, подождите, это не то, о чем я спрашиваю. Как мы на самом деле это реализуем?"

Да, это грубый подход. Мы предварительно определяем список имен нативных тегов и определяем, соответствует ли он или нет.  
Что касается того, какие элементы должны быть перечислены, все они должны быть записаны в спецификации, поэтому мы будем доверять ей и использовать ее.

Одна проблема, если она есть, заключается в том, что "что такое нативный тег" может варьироваться в зависимости от среды.  
В данном случае это браузер. Что я имею в виду, так это то, что "compiler-core не должен зависеть от среды".  
Мы реализовали такие DOM-зависимые реализации в compiler-dom до сих пор, и это перечисление не исключение.

С учетом этого мы реализуем это так, чтобы функция "является ли это нативным тегом или нет" могла быть внедрена как опция извне парсера, учитывая будущие возможности и делая его легким для добавления различных опций позже.

```ts
type OptionalOptions = 'isNativeTag' // | TODO: Добавить больше в будущем (возможно)

type MergedParserOptions = Omit<Required<ParserOptions>, OptionalOptions> &
  Pick<ParserOptions, OptionalOptions>

export interface ParserContext {
  // .
  // .
  options: MergedParserOptions // [!code ++]
  // .
  // .
}

function createParserContext(
  content: string,
  rawOptions: ParserOptions, // [!code ++]
): ParserContext {
  const options = Object.assign({}, defaultParserOptions) // [!code ++]

  let key: keyof ParserOptions // [!code ++]
  // prettier-ignore
  for (key in rawOptions) { // [!code ++]
    options[key] = // [!code ++]
      rawOptions[key] === undefined // [!code ++]
        ? defaultParserOptions[key] // [!code ++]
        : rawOptions[key]; // [!code ++]
  } // [!code ++]

  // .
  // .
  // .
}

export const baseParse = (
  content: string,
  options: ParserOptions = {}, // [!code ++]
): RootNode => {
  const context = createParserContext(
    content,
    options, // [!code ++]
  )
  const children = parseChildren(context, [])
  return createRoot(children)
}
```

Теперь в compiler-dom мы перечислим имена нативных тегов и передадим их как опции.

Хотя я упомянул compiler-dom, само перечисление выполняется в shared/domTagConfig.ts.

```ts
import { makeMap } from './makeMap'

// https://developer.mozilla.org/en-US/docs/Web/HTML/Element
const HTML_TAGS =
  'html,body,base,head,link,meta,style,title,address,article,aside,footer,' +
  'header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,' +
  'figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,' +
  'data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,' +
  'time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,' +
  'canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,' +
  'th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,' +
  'option,output,progress,select,textarea,details,dialog,menu,' +
  'summary,template,blockquote,iframe,tfoot'

export const isHTMLTag = makeMap(HTML_TAGS)
```

Выглядит довольно зловеще, не так ли?

Но это правильная реализация.

https://github.com/vuejs/core/blob/32bdc5d1900ceb8df1e8ee33ea65af7b4da61051/packages/shared/src/domTagConfig.ts#L6

Создайте compiler-dom/parserOptions.ts и передайте его в компилятор.

```ts
// compiler-dom/parserOptions.ts

import { ParserOptions } from '../compiler-core'
import { isHTMLTag, isSVGTag } from '../shared/domTagConfig'

export const parserOptions: ParserOptions = {
  isNativeTag: tag => isHTMLTag(tag) || isSVGTag(tag),
}
```

```ts
export function compile(template: string, option?: CompilerOptions) {
  const defaultOption = { isBrowser: true }
  if (option) Object.assign(defaultOption, option)
  return baseCompile(
    template,
    Object.assign(
      {},
      parserOptions, // [!code ++]
      defaultOption,
      {
        directiveTransforms: DOMDirectiveTransforms,
      },
    ),
  )
}
```

Реализация парсера завершена, теперь перейдем к реализации оставшихся частей.

Оставшаяся часть очень проста. Нам просто нужно определить, является ли это компонентом или нет, и назначить tagType.

```ts
function parseElement(
  context: ParserContext,
  ancestors: ElementNode[],
): ElementNode | undefined {
  // .
  // .
  let tagType = ElementTypes.ELEMENT // [!code ++]
  // prettier-ignore
  if (isComponent(tag, context)) { // [!code ++]
    tagType = ElementTypes.COMPONENT;// [!code ++]
  } // [!code ++]

  return {
    // .
    tagType, // [!code ++]
    // .
  }
}

function isComponent(tag: string, context: ParserContext) {
  const options = context.options
  if (
    // ПРИМЕЧАНИЕ: В Vue.js теги, начинающиеся с заглавной буквы, рассматриваются как компоненты.
    // ref: https://github.com/vuejs/core/blob/32bdc5d1900ceb8df1e8ee33ea65af7b4da61051/packages/compiler-core/src/parse.ts#L662
    /^[A-Z]/.test(tag) ||
    (options.isNativeTag && !options.isNativeTag(tag))
  ) {
    return true
  }
}
```

На этом парсер и AST завершены. Теперь перейдем к реализации transform и codegen с их использованием.

### Transform

То, что нужно сделать в transform, очень просто.

В transformElement мы просто должны сделать небольшое преобразование, если Node является ComponentNode.

В это время мы также регистрируем компонент в контексте.  
Это делается для того, чтобы мы могли разрешить его коллективно во время codegen.
Как упоминалось позже, компоненты будут разрешаться коллективно как assets в codegen.

```ts
// compiler-core/transforms/transformElement.ts
export const transformElement: NodeTransform = (node, context) => {
  return function postTransformElement() {
    // .
    // .

    const isComponent = node.tagType === ElementTypes.COMPONENT // [!code ++]

    const vnodeTag = isComponent // [!code ++]
      ? resolveComponentType(node as ComponentNode, context) // [!code ++]
      : `"${tag}"` // [!code ++]

    // .
    // .
  }
}

function resolveComponentType(node: ComponentNode, context: TransformContext) {
  let { tag } = node
  context.helper(RESOLVE_COMPONENT)
  context.components.add(tag) // объяснено позже
  return toValidAssetId(tag, `component`)
}
```

```ts
// util.ts
export function toValidAssetId(
  name: string,
  type: 'component', // | TODO:
): string {
  return `_${type}_${name.replace(/[^\w]/g, (searchValue, replaceValue) => {
    return searchValue === '-' ? '_' : name.charCodeAt(replaceValue).toString()
  })}`
}
```

Мы также убедимся, что зарегистрировали его в контексте.

```ts
export interface TransformContext extends Required<TransformOptions> {
  // .
  components: Set<string> // [!code ++]
  // .
}

export function createTransformContext(
  root: RootNode,
  {
    nodeTransforms = [],
    directiveTransforms = {},
    isBrowser = false,
  }: TransformOptions,
): TransformContext {
  const context: TransformContext = {
    // .
    components: new Set(), // [!code ++]
    // .
  }
}
```

И затем все компоненты в контексте регистрируются в RootNode целевых компонентов.

```ts
export interface RootNode extends Node {
  type: NodeTypes.ROOT
  children: TemplateChildNode[]
  codegenNode?: TemplateChildNode | VNodeCall
  helpers: Set<symbol>
  components: string[] // [!code ++]
}
```

```ts
export function transform(root: RootNode, options: TransformOptions) {
  const context = createTransformContext(root, options)
  traverseNode(root, context)
  createRootCodegen(root, context)
  root.helpers = new Set([...context.helpers.keys()])
  root.components = [...context.components] // [!code ++]
}
```

С этим все, что осталось - это использовать RootNode.components в codegen.

### Codegen

Код просто генерирует код, передавая имя вспомогательным функциям для разрешения, точно так же, как результат компиляции, который мы видели в начале. Мы абстрагируем это как "assets" для будущих соображений.

```ts
export const generate = (ast: RootNode, option: CompilerOptions): string => {
  // .
  // .
  genFunctionPreamble(ast, context) // ПРИМЕЧАНИЕ: В будущем переместить это за пределы функции

  // prettier-ignore
  if (ast.components.length) { // [!code ++]
    genAssets(ast.components, "component", context); // [!code ++]
    newline(); // [!code ++]
    newline(); // [!code ++]
  } // [!code ++]

  push(`return `)
  // .
  // .
}

function genAssets(
  assets: string[],
  type: 'component' /* TODO: */,
  { helper, push, newline }: CodegenContext,
) {
  if (type === 'component') {
    const resolver = helper(RESOLVE_COMPONENT)
    for (let i = 0; i < assets.length; i++) {
      let id = assets[i]

      push(
        `const ${toValidAssetId(id, type)} = ${resolver}(${JSON.stringify(
          id,
        )})`,
      )
      if (i < assets.length - 1) {
        newline()
      }
    }
  }
}
```

### Реализация на стороне runtime-core

Теперь, когда мы сгенерировали желаемый код, давайте перейдем к реализации в runtime-core.

#### Добавление "component" как опции для компонентов

Это просто, просто добавьте его в опции.

```ts
export type ComponentOptions<
  // .
  // .
> = {
  // .
  components?: Record<string, Component>
  // .
}
```

#### Добавление "components" как опции для приложения

Это тоже просто.

```ts
export interface AppContext {
  // .
  components: Record<string, Component> // [!code ++]
  // .
}

export function createAppContext(): AppContext {
  return {
    // .
    components: {}, // [!code ++]
    // .
  }
}

export function createAppAPI<HostElement>(
  render: RootRenderFunction<HostElement>,
): CreateAppFunction<HostElement> {
  return function createApp(rootComponent) {
    // .
    const app: App = (context.app = {
      // .
      // prettier-ignore
      component(name: string, component: Component): any { // [!code ++]
        context.components[name] = component; // [!code ++]
        return app; // [!code ++]
      },
    })
  }
}
```

#### Реализация функции для разрешения компонентов из вышеуказанных двух

Здесь нечего особо объяснять.  
Он ищет компоненты, зарегистрированные локально и глобально, и возвращает компонент.  
Если он не найден, он возвращает имя как есть в качестве запасного варианта.

```ts
// runtime-core/helpers/componentAssets.ts

export function resolveComponent(name: string): ConcreteComponent | string {
  const instance = currentInstance || currentRenderingInstance // объяснено позже
  if (instance) {
    const Component = instance.type
    const res =
      // локальная регистрация
      resolve((Component as ComponentOptions).components, name) ||
      // глобальная регистрация
      resolve(instance.appContext.components, name)
    return res
  }

  return name
}

function resolve(registry: Record<string, any> | undefined, name: string) {
  return (
    registry &&
    (registry[name] ||
      registry[camelize(name)] ||
      registry[capitalize(camelize(name))])
  )
}
```

Одна вещь, которую стоит отметить, это `currentRenderingInstance`.

Чтобы пройти по локально зарегистрированным компонентам в `resolveComponent`, нам нужно получить доступ к текущему рендерящемуся компоненту.  
(Мы хотим искать опцию `components` компонента, который рендерится)

С учетом этого давайте подготовим `currentRenderingInstance` и обновим его при рендеринге.

```ts
// runtime-core/componentRenderContexts.ts

export let currentRenderingInstance: ComponentInternalInstance | null = null

export function setCurrentRenderingInstance(
  instance: ComponentInternalInstance | null,
): ComponentInternalInstance | null {
  const prev = currentRenderingInstance
  currentRenderingInstance = instance
  return prev
}
```

```ts
// runtime-core/renderer.ts

const setupRenderEffect = (
  instance: ComponentInternalInstance,
  initialVNode: VNode,
  container: RendererElement,
  anchor: RendererElement | null,
) => {
  const componentUpdateFn = () => {
    // .
    // .
    const prev = setCurrentRenderingInstance(instance) // [!code ++]
    const subTree = (instance.subTree = normalizeVNode(render(proxy!))) // [!code ++]
    setCurrentRenderingInstance(prev) // [!code ++]
    // .
    // .
  }
  // .
  // .
}
```

## Давайте попробуем

Отличная работа! Наконец-то мы можем разрешать компоненты.

Давайте попробуем запустить это в playground!

```ts
import { createApp } from 'chibivue'

import App from './App.vue'
import Counter from './components/Counter.vue'

const app = createApp(App)
app.component('GlobalCounter', Counter)
app.mount('#app')
```

App.vue

```vue
<script>
import Counter from './components/Counter.vue'

import { defineComponent } from 'chibivue'

export default defineComponent({
  components: { Counter },
})
</script>

<template>
  <Counter />
  <Counter />
  <GlobalCounter />
</template>
```

components/Counter.vue

```vue
<script>
import { ref, defineComponent } from 'chibivue'

export default defineComponent({
  setup() {
    const count = ref(0)
    return { count }
  },
})
</script>

<template>
  <button @click="count++">count: {{ count }}</button>
</template>
```

![resolve_components](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/resolve_components.png)

Похоже, все работает отлично! Отличная работа!

Исходный код до этого момента: [GitHub](https://github.com/chibivue-land/chibivue/tree/main/book/impls/50_basic_template_compiler/060_resolve_components)
