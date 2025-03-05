# transformExpression

## Целевой интерфейс разработчика и текущие проблемы

Сначала посмотрите на этот компонент.

```vue
<script>
import { ref } from 'chibivue'

export default {
  setup() {
    const count = ref(0)
    const increment = () => {
      count.value++
    }
    return { count, increment }
  },
}
</script>

<template>
  <div>
    <button :onClick="increment">count + count is: {{ count + count }}</button>
  </div>
</template>
```

С этим компонентом есть несколько проблем.  
Поскольку этот компонент написан в SFC, оператор `with` не используется.  
Другими словами, привязки не работают должным образом.

Давайте посмотрим на скомпилированный код.

```js
const _sfc_main = {
  setup() {
    const count = ref(0)
    const increment = () => {
      count.value++
    }
    return { count, increment }
  },
}

function render(_ctx) {
  const { h, mergeProps, normalizeProps, normalizeClass, normalizeStyle } =
    ChibiVue

  return h('div', null, [
    '\n    ',
    h('button', normalizeProps({ onClick: increment }), [
      'count + count is: ',
      _ctx.count + count,
    ]),
    '\n  ',
  ])
}

export default { ..._sfc_main, render }
```

- Проблема 1: `increment`, зарегистрированный как обработчик события, не может получить доступ к `_ctx`.  
  Это потому, что префикс не был добавлен в предыдущей реализации `v-bind`.
- Проблема 2: Выражение `count + count` не может получить доступ к `_ctx`.  
  Что касается синтаксиса mustache, он только добавляет `_ctx.` в начало и не может обрабатывать другие идентификаторы.  
  Поэтому все идентификаторы, которые появляются в середине выражения, должны иметь префикс `_ctx.`. Это относится ко всем частям, не только к mustache.

Похоже, что нужен процесс добавления `_ctx.` к идентификаторам, которые появляются в выражениях.

::: details Желаемый результат компиляции

```js
const _sfc_main = {
  setup() {
    const count = ref(0)
    const increment = () => {
      count.value++
    }
    return { count, increment }
  },
}

function render(_ctx) {
  const { h, mergeProps, normalizeProps, normalizeClass, normalizeStyle } =
    ChibiVue

  return h('div', null, [
    '\n    ',
    h('button', normalizeProps({ onClick: _ctx.increment }), [
      'count + count is: ',
      _ctx.count + _ctx.count,
    ]),
    '\n  ',
  ])
}

export default { ..._sfc_main, render }
```

:::

::: warning

На самом деле, оригинальная реализация использует немного другой подход.

Как вы можете видеть ниже, в оригинальной реализации все, что привязано из функции `setup`, разрешается через `$setup`.

![resolve_bindings_original](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/resolve_bindings_original.png)

Однако реализация этого немного сложна, поэтому мы упростим ее и реализуем путем добавления `_ctx.`. (Все props и setup будут разрешаться из `_ctx`)

:::

## Подход к реализации

Если говорить просто, то то, что мы хотим сделать, это "добавить `_ctx.` в начало каждого Identifier (имени) в ExpressionNode".

Позвольте мне объяснить это немного подробнее.  
Как обзор, программа представляется как AST путем парсинга.  
И AST, представляющий программу, имеет два основных типа узлов: Expression и Statement.  
Они обычно известны как выражения и операторы.

```ts
1 // Это Expression
ident // Это Expression
func() // Это Expression
ident + func() // Это Expression

let a // Это Statement
if (!a) a = 1 // Это Statement
for (let i = 0; i < 10; i++) a++ // Это Statement
```

То, что мы хотим рассмотреть здесь, это Expression.  
Существуют различные типы выражений. Identifier - это один из них, который является выражением, представленным идентификатором.  
(Вы можете думать об этом как об имени переменной в общем)

Identifier появляется в различных местах в выражении.

```ts
1 // Нет
ident // ident --- (1)
func() // func --- (2)
ident + func() // ident, func --- (3)
```

Таким образом, Identifier появляется в различных местах в выражении.

Вы можете наблюдать различные Identifier в ExpressionNode, введя программу на следующем сайте, который позволяет наблюдать AST.  
https://astexplorer.net/#/gist/670a1bee71dbd50bec4e6cc176614ef8/9a9ff250b18ccd9000ed253b0b6970696607b774

## Поиск идентификаторов

Теперь, когда мы знаем, что мы хотим сделать, как мы это реализуем?

Это кажется очень сложным, но на самом деле это просто. Мы будем использовать библиотеку под названием estree-walker.  
https://github.com/Rich-Harris/estree-walker

Мы будем использовать эту библиотеку для обхода AST, полученного путем парсинга с помощью babel.  
Использование очень простое. Просто передайте AST в функцию `walk` и опишите обработку для каждого Node в качестве второго аргумента.  
Эта функция `walk` проходит через AST узел за узлом, и обработка в момент, когда она достигает этого Node, выполняется с помощью опции `enter`.  
Помимо `enter`, есть также опции, такие как `leave`, для обработки в конце этого Node. Мы будем использовать только `enter` в этот раз.

Создайте новый файл под названием `compiler-core/babelUtils.ts` и реализуйте служебные функции, которые могут выполнять операции с Identifier.

Сначала установите estree-walker.

```sh
npm install estree-walker

npm install -D @babel/types # Также установите это
```

```ts
import { Identifier, Node } from '@babel/types'

import { walk } from 'estree-walker'

export function walkIdentifiers(
  root: Node,
  onIdentifier: (node: Identifier) => void,
) {
  ;(walk as any)(root, {
    enter(node: Node) {
      if (node.type === 'Identifier') {
        onIdentifier(node)
      }
    },
  })
}
```

Затем сгенерируйте AST для выражения и передайте его в эту функцию для выполнения преобразования при переписывании узлов.

## Реализация transformExpression

### Изменения в AST и парсере для InterpolationNode

Мы реализуем основную часть процесса преобразования, transformExpression.

Сначала мы изменим InterpolationNode так, чтобы он имел SimpleExpressionNode вместо строки в качестве своего содержимого.

```ts
export interface InterpolationNode extends Node {
  type: NodeTypes.INTERPOLATION
  content: string // [!code --]
  content: ExpressionNode // [!code ++]
}
```

С этим изменением нам также нужно изменить parseInterpolation.

```ts
function parseInterpolation(
  context: ParserContext,
): InterpolationNode | undefined {
  // .
  // .
  // .
  return {
    type: NodeTypes.INTERPOLATION,
    content: {
      type: NodeTypes.SIMPLE_EXPRESSION,
      isStatic: false,
      content,
      loc: getSelection(context, innerStart, innerEnd),
    },
    loc: getSelection(context, start),
  }
}
```

### Реализация трансформера (основная часть)

Чтобы сделать преобразование выражений доступным в других трансформерах, мы извлечем его как функцию под названием `processExpression`.
В transformExpression мы будем обрабатывать ExpressionNode из INTERPOLATION и DIRECTIVE.

```ts
export const transformExpression: NodeTransform = node => {
  if (node.type === NodeTypes.INTERPOLATION) {
    node.content = processExpression(node.content as SimpleExpressionNode)
  } else if (node.type === NodeTypes.ELEMENT) {
    for (let i = 0; i < node.props.length; i++) {
      const dir = node.props[i]
      if (dir.type === NodeTypes.DIRECTIVE) {
        const exp = dir.exp
        const arg = dir.arg
        if (exp && exp.type === NodeTypes.SIMPLE_EXPRESSION) {
          dir.exp = processExpression(exp)
        }
        if (arg && arg.type === NodeTypes.SIMPLE_EXPRESSION && !arg.isStatic) {
          dir.arg = processExpression(arg)
        }
      }
    }
  }
}

export function processExpression(node: SimpleExpressionNode): ExpressionNode {
  // TODO:
}
```

Далее давайте объясним реализацию processExpression.
Сначала мы реализуем функцию под названием rewriteIdentifier для переписывания Identifier внутри node.
Если node является одиночным Identifier, мы просто применяем эту функцию и возвращаем его.

Одна вещь, которую следует отметить, это то, что этот processExpression специфичен для случаев SFC (Single File Component) (случаев без использования оператора with).
Другими словами, если установлен флаг isBrowser, мы реализуем его так, чтобы просто возвращать node.
Мы изменяем реализацию, чтобы получать флаг через ctx.

Также я хочу оставить литералы, такие как true и false, как есть, поэтому я создам белый список для литералов.

```ts
export function processExpression(
  node: SimpleExpressionNode,
  ctx: TransformContext,
): ExpressionNode {
  if (ctx.isBrowser) {
    // Ничего не делаем для браузера
    return node
  }

  const rawExp = node.content

  const rewriteIdentifier = (raw: string) => {
    return `_ctx.${raw}`
  }

  if (isSimpleIdentifier(rawExp)) {
    node.content = rewriteIdentifier(rawExp)
    return node
  }

  // TODO:
}
```

`makeMap` - это вспомогательная функция для проверки существования, реализованная в vuejs/core, которая возвращает булево значение, указывающее, соответствует ли она строке, определенной с разделением запятыми.

```ts
export function makeMap(
  str: string,
  expectsLowerCase?: boolean,
): (key: string) => boolean {
  const map: Record<string, boolean> = Object.create(null)
  const list: Array<string> = str.split(',')
  for (let i = 0; i < list.length; i++) {
    map[list[i]] = true
  }
  return expectsLowerCase ? val => !!map[val.toLowerCase()] : val => !!map[val]
}
```

Проблема заключается в следующем шаге, который заключается в том, как преобразовать SimpleExpressionNode (не простой Identifier) и преобразовать узел.
В следующем обсуждении, пожалуйста, обратите внимание на то, что мы будем иметь дело с двумя разными AST: AST JavaScript, сгенерированным Babel, и AST, определенным chibivue.
Чтобы избежать путаницы, мы будем называть первый estree, а второй AST в этой главе.

Стратегия разделена на два этапа.

1. Заменить узел estree, собирая узел
2. Построить AST на основе собранного узла

Сначала давайте начнем с этапа 1.
Это относительно просто. Если мы можем разобрать исходное содержимое SimpleExpressionNode (строку) с помощью Babel и получить estree, мы можем пропустить его через служебную функцию, которую мы создали ранее, и применить rewriteIdentifier.
На этом этапе мы собираем узел estree.

```ts
import { parse } from '@babel/parser'
import { Identifier } from '@babel/types'
import { walkIdentifiers } from '../babelUtils'

interface PrefixMeta {
  start: number
  end: number
}

export function processExpression(
  node: SimpleExpressionNode,
  ctx: TransformContext,
): ExpressionNode {
  // .
  // .
  // .
  const ast = parse(`(${rawExp})`).program // ※ Этот ast относится к estree.
  type QualifiedId = Identifier & PrefixMeta
  const ids: QualifiedId[] = []

  walkIdentifiers(ast, node => {
    node.name = rewriteIdentifier(node.name)
    ids.push(node as QualifiedId)
  })

  // TODO:
}
```

Одна вещь, которую следует отметить, это то, что до этого момента мы только манипулировали estree и не манипулировали узлом ast.

### CompoundExpression

Далее давайте перейдем к этапу 2. Здесь мы определим новый AST Node под названием `CompoundExpressionNode`.
Compound подразумевает "комбинацию" или "сложность". Этот Node имеет children, которые принимают немного специальные значения.
Сначала давайте посмотрим на определение AST.

```ts
export interface CompoundExpressionNode extends Node {
  type: NodeTypes.COMPOUND_EXPRESSION
  children: (
    | SimpleExpressionNode
    | CompoundExpressionNode
    | InterpolationNode
    | TextNode
    | string
  )[]
}
```

Children принимает массив, подобный показанному выше.
Чтобы понять, что представляют children в этом Node, было бы легче увидеть конкретные примеры, поэтому давайте приведем некоторые примеры.

Следующее выражение будет разобрано в следующий CompoundExpressionNode:

```ts
count * 2
```

```json
{
  "type": 7,
  "children": [
    {
      "type": 4,
      "isStatic": false,
      "content": "_ctx.count"
    },
    " * 2"
  ]
}
```

Это довольно странное чувство. Причина, по которой "children" принимает тип string, заключается в том, что он принимает эту форму.  
В CompoundExpression компилятор Vue разделяет его на необходимую детализацию и выражает его частично как строку или частично как Node.  
В частности, в случаях, подобных этому, где Identifier, существующий в Expression, переписывается, только часть Identifier разделяется на другой SimpleExpressionNode.

Другими словами, то, что мы собираемся сделать, это сгенерировать этот CompoundExpression на основе собранного узла estree's Identifier Node и source.  
Следующий код является реализацией для этого.

```ts
export function processExpression(node: SimpleExpressionNode): ExpressionNode {
  // .
  // .
  // .
  const children: CompoundExpressionNode['children'] = []
  ids.sort((a, b) => a.start - b.start)
  ids.forEach((id, i) => {
    const start = id.start - 1
    const end = id.end - 1
    const last = ids[i - 1]
    const leadingText = rawExp.slice(last ? last.end - 1 : 0, start)
    if (leadingText.length) {
      children.push(leadingText)
    }

    const source = rawExp.slice(start, end)
    children.push(
      createSimpleExpression(id.name, false, {
        source,
        start: advancePositionWithClone(node.loc.start, source, start),
        end: advancePositionWithClone(node.loc.start, source, end),
      }),
    )
    if (i === ids.length - 1 && end < rawExp.length) {
      children.push(rawExp.slice(end))
    }
  })

  let ret
  if (children.length) {
    ret = createCompoundExpression(children, node.loc)
  } else {
    ret = node
  }

  return ret
}
```

Node, разобранный Babel, имеет start и end (информацию о местоположении, где он соответствует исходной строке), поэтому мы извлекаем соответствующую часть из rawExp на основе этого и разделяем ее усердно.  
Пожалуйста, внимательно посмотрите на исходный код для получения более подробной информации. Если вы понимаете политику до сих пор, вы должны быть в состоянии прочитать его. (Также, пожалуйста, посмотрите на реализацию advancePositionWithClone и т.д., так как они недавно реализованы.)

Теперь, когда мы можем генерировать CompoundExpressionNode, давайте также поддержим его в Codegen.

```ts
function genInterpolation(
  node: InterpolationNode,
  context: CodegenContext,
  option: Required<CompilerOptions>,
) {
  genNode(node.content, context, option)
}

function genCompoundExpression(
  node: CompoundExpressionNode,
  context: CodegenContext,
  option: Required<CompilerOptions>,
) {
  for (let i = 0; i < node.children!.length; i++) {
    const child = node.children![i]
    if (isString(child)) {
      // Если это строка, push ее как есть
      context.push(child)
    } else {
      // Для всего остального, генерируем codegen для Node
      genNode(child, context, option)
    }
  }
}
```

(genInterpolation стал просто genNode, но я оставлю его пока так.)

## Попробуем

Теперь, когда мы реализовали это, давайте завершим компилятор и попробуем запустить его!

```ts
// Добавляем transformExpression
export function getBaseTransformPreset(): TransformPreset {
  return [[transformElement], { bind: transformBind }] // [!code --]
  return [[transformExpression, transformElement], { bind: transformBind }] // [!code ++]
}
```

```ts
import { createApp, defineComponent, ref } from 'chibivue'

const App = defineComponent({
  setup() {
    const count = ref(3)
    const getMsg = (count: number) => `Count: ${count}`
    return { count, getMsg }
  },

  template: `
    <div class="container">
      <p> {{ 'Message is "' + getMsg(count) + '"'}} </p>
    </div>
  `,
})

const app = createApp(App)

app.mount('#app')
```

Исходный код до этого момента: [GitHub](https://github.com/chibivue-land/chibivue/tree/main/book/impls/50_basic_template_compiler/022_transform_expression)
