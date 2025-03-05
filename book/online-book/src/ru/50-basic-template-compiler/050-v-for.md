# Поддержка директивы v-for

## Целевой интерфейс разработчика

Теперь давайте продолжим с реализацией директив. В этот раз попробуем поддержать v-for.

Что ж, я думаю, это знакомая директива для тех из вас, кто использовал Vue.js раньше.

Существуют различные синтаксисы для v-for.
Самый базовый - это перебор массива, но вы также можете перебирать другие вещи, такие как строки, ключи объектов, диапазоны и так далее.

https://vuejs.org/v2/guide/list.html

Это немного длинно, но в этот раз давайте нацелимся на следующий интерфейс разработчика:

```vue
<script>
import { createApp, defineComponent, ref } from 'chibivue'

const genId = () => Math.random().toString(36).slice(2)

const FRUITS_FACTORIES = [
  () => ({ id: genId(), name: 'apple', color: 'red' }),
  () => ({ id: genId(), name: 'banana', color: 'yellow' }),
  () => ({ id: genId(), name: 'grape', color: 'purple' }),
]

export default {
  setup() {
    const fruits = ref([...FRUITS_FACTORIES].map(f => f()))
    const addFruit = () => {
      fruits.value.push(
        FRUITS_FACTORIES[Math.floor(Math.random() * FRUITS_FACTORIES.length)](),
      )
    }
    return { fruits, addFruit }
  },
}
</script>

<template>
  <button @click="addFruit">add fruits!</button>

  <!-- basic -->
  <ul>
    <li v-for="fruit in fruits" :key="fruit.id">
      <span :style="{ backgroundColor: fruit.color }">{{ fruit.name }}</span>
    </li>
  </ul>

  <!-- indexed -->
  <ul>
    <li v-for="(fruit, i) in fruits" :key="fruit.id">
      <span :style="{ backgroundColor: fruit.color }">{{ fruit.name }}</span>
    </li>
  </ul>

  <!-- destructuring -->
  <ul>
    <li v-for="({ id, name, color }, i) in fruits" :key="id">
      <span :style="{ backgroundColor: color }">{{ name }}</span>
    </li>
  </ul>

  <!-- object -->
  <ul>
    <li v-for="(value, key, idx) in fruits[0]" :key="key">
      [{{ idx }}] {{ key }}: {{ value }}
    </li>
  </ul>

  <!-- range -->
  <ul>
    <li v-for="n in 10">{{ n }}</li>
  </ul>

  <!-- string -->
  <ul>
    <li v-for="c in 'hello'">{{ c }}</li>
  </ul>

  <!-- nested -->
  <ul>
    <li v-for="({ id, name, color }, i) in fruits" :key="id">
      <span :style="{ backgroundColor: color }">
        <span v-for="n in 3">{{ n }}</span>
        <span>{{ name }}</span>
      </span>
    </li>
  </ul>
</template>
```

Вы можете подумать: "Мы реализуем так много вещей сразу? Это невозможно!" Но не волнуйтесь, я объясню все пошагово.

## Подход к реализации

Сначала давайте подумаем о том, как мы хотим скомпилировать это в общих чертах, и рассмотрим, где могут быть сложные моменты при реализации.

Сначала давайте посмотрим на желаемый результат компиляции.

Базовая структура не так сложна. Мы реализуем вспомогательную функцию под названием renderList в runtime-core для рендеринга списка и скомпилируем ее в выражение.

Пример 1:

```html
<!-- input -->
<li v-for="fruit in fruits" :key="fruit.id">{{ fruit.name }}</li>
```

```ts
// output
h(
  _Fragment,
  null,
  _renderList(fruits, fruit => h('li', { key: fruit.id }, fruit.name)),
)
```

Пример 2:

```html
<!-- input -->
<li v-for="(fruit, idx) in fruits" :key="fruit.id">
  {{ idx }}: {{ fruit.name }}
</li>
```

```ts
// output
h(
  _Fragment,
  null,
  _renderList(fruits, fruit => h('li', { key: fruit.id }, fruit.name)),
)
```

Пример 3:

```html
<!-- input -->
<li v-for="{ name, id } in fruits" :key="id">{{ name }}</li>
```

```ts
// output
h(
  _Fragment,
  null,
  _renderList(fruits, ({ name, id }) => h('li', { key: id }, name)),
)
```

В будущем значения, передаваемые в качестве первого аргумента в renderList, ожидаются не только массивы, но и числа и объекты. Однако пока давайте предположим, что ожидаются только массивы. Реализацию самой функции _renderList можно понимать как что-то похожее на Array.prototype.map. Что касается значений, отличных от массивов, вам просто нужно нормализовать их в _renderList, так что давайте пока забудем о них (просто сосредоточимся на массивах).

Теперь для тех из вас, кто реализовал различные директивы до сих пор, реализация такого компилятора (трансформера) не должна быть слишком сложной.

## Ключевые моменты реализации (сложные моменты)

Сложный момент возникает при использовании в SFC (Single File Components). Помните ли вы разницу между компилятором, используемым в SFC, и тем, который используется в браузере? Да, это разрешение выражений с использованием `_ctx`.

В v-for локальные переменные, определенные пользователем, появляются в различных формах, поэтому вам нужно правильно собрать их и пропустить rewriteIdentifiers.

```ts
// Плохой пример
h(
  _Fragment,
  null,
  _renderList(
    _ctx.fruits, // Нормально иметь префикс для fruits, потому что он привязан из _ctx
    ({ name, id }) =>
      h(
        'li',
        { key: _ctx.id }, // Здесь не нужен _ctx
        _ctx.name, // Здесь не нужен _ctx
      ),
  ),
)
```

```ts
// Хороший пример
h(
  _Fragment,
  null,
  _renderList(
    _ctx.fruits, // Нормально иметь префикс для fruits, потому что он привязан из _ctx
    ({ name, id }) =>
      h(
        'li',
        { key: id }, // Здесь не нужен _ctx
        name, // Здесь не нужен _ctx
      ),
  ),
)
```

Существуют различные определения локальных переменных, от примера 1 до 3.

Вам нужно проанализировать каждое определение и собрать идентификаторы, которые нужно пропустить.

Теперь давайте отложим в сторону то, как этого достичь, и начнем реализацию с общей картины.

## Реализация AST

Для начала давайте определим AST как обычно.

Как и в случае с v-if, мы рассмотрим преобразованный AST (нет необходимости реализовывать парсер).

```ts
export const enum NodeTypes {
  // .
  // .
  FOR, // [!code ++]
  // .
  // .
  JS_FUNCTION_EXPRESSION, // [!code ++]
}

export type ParentNode =
  | RootNode
  | ElementNode
  | ForNode // [!code ++]
  | IfBranchNode

export interface ForNode extends Node {
  type: NodeTypes.FOR
  source: ExpressionNode
  valueAlias: ExpressionNode | undefined
  keyAlias: ExpressionNode | undefined
  children: TemplateChildNode[]
  parseResult: ForParseResult // Будет объяснено позже
  codegenNode?: ForCodegenNode
}

export interface ForCodegenNode extends VNodeCall {
  isBlock: true
  tag: typeof FRAGMENT
  props: undefined
  children: ForRenderListExpression
}

export interface ForRenderListExpression extends CallExpression {
  callee: typeof RENDER_LIST // Будет объяснено позже
  arguments: [ExpressionNode, ForIteratorExpression]
}

// Также поддерживаем функциональные выражения, поскольку функции обратного вызова используются в качестве второго аргумента renderList.
export interface FunctionExpression extends Node {
  type: NodeTypes.JS_FUNCTION_EXPRESSION
  params: ExpressionNode | string | (ExpressionNode | string)[] | undefined
  returns?: TemplateChildNode | TemplateChildNode[] | JSChildNode
  newline: boolean
}

// В случае v-for возвращаемое значение фиксировано, поэтому оно представлено как AST для этой цели.
export interface ForIteratorExpression extends FunctionExpression {
  returns: VNodeCall
}

export type JSChildNode =
  | VNodeCall
  | CallExpression
  | ObjectExpression
  | ArrayExpression
  | ConditionalExpression
  | ExpressionNode
  | FunctionExpression // [!code ++]
```

Что касается `RENDER_LIST`, как обычно, добавьте его в `runtimeHelpers`.

```ts
// runtimeHelpers.ts
// .
// .
// .
export const RENDER_LIST = Symbol() // [!code ++]

export const helperNameMap: Record<symbol, string> = {
  // .
  // .
  [RENDER_LIST]: `renderList`, // [!code ++]
  // .
  // .
}
```

Что касается `ForParseResult`, его определение находится в `transform/vFor`.

```ts
export interface ForParseResult {
  source: ExpressionNode
  value: ExpressionNode | undefined
  key: ExpressionNode | undefined
  index: ExpressionNode | undefined
}
```

Чтобы объяснить, к чему относится каждый из них,

В случае `v-for="(fruit, i) in fruits"`,

- source: `fruits`
- value: `fruit`
- key: `i`
- index: `undefined`

`index` - это третий аргумент при применении объекта к `v-for`.

https://vuejs.org/v2/guide/list.html#v-for-with-an-object

![v_for_ast.drawio.png](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/v_for_ast.drawio.png)

Что касается `value`, если вы используете деструктурирующее присваивание, как `{ id, name, color, }`, оно будет иметь несколько идентификаторов.

Мы собираем идентификаторы, определенные `value`, `key` и `index`, и пропускаем добавление префикса.

## Реализация codegen

Хотя порядок немного нарушен, давайте сначала реализуем codegen, потому что об этом не так много нужно говорить.
Есть только две вещи, которые нужно сделать: обработка `NodeTypes.FOR` и codegen для функциональных выражений (которые оказались первым появлением).

```ts
switch (node.type) {
  case NodeTypes.ELEMENT:
  case NodeTypes.FOR: // [!code ++]
  case NodeTypes.IF:
  // .
  // .
  // .
  case NodeTypes.JS_FUNCTION_EXPRESSION: // [!code ++]
    genFunctionExpression(node, context, option) // [!code ++]
    break // [!code ++]
  // .
  // .
  // .
}

function genFunctionExpression(
  node: FunctionExpression,
  context: CodegenContext,
  option: CompilerOptions,
) {
  const { push, indent, deindent } = context
  const { params, returns, newline } = node

  push(`(`, node)
  if (isArray(params)) {
    genNodeList(params, context, option)
  } else if (params) {
    genNode(params, context, option)
  }
  push(`) => `)
  if (newline) {
    push(`{`)
    indent()
  }
  if (returns) {
    if (newline) {
      push(`return `)
    }
    if (isArray(returns)) {
      genNodeListAsArray(returns, context, option)
    } else {
      genNode(returns, context, option)
    }
  }
  if (newline) {
    deindent()
    push(`}`)
  }
}
```

Здесь нет ничего особенно сложного. На этом все.

## Реализация transformer

### Подготовка

Перед реализацией transformer есть также некоторые подготовительные работы.

Как мы делали с `v-on`, в случае `v-for` время выполнения `processExpression` немного особенное (нам нужно собрать локальные переменные), поэтому мы пропускаем его в `transformExpression`.

```ts
export const transformExpression: NodeTransform = (node, ctx) => {
  if (node.type === NodeTypes.INTERPOLATION) {
    node.content = processExpression(node.content as SimpleExpressionNode, ctx)
  } else if (node.type === NodeTypes.ELEMENT) {
    for (let i = 0; i < node.props.length; i++) {
      const dir = node.props[i]
      if (
        dir.type === NodeTypes.DIRECTIVE &&
        dir.name !== 'for' // [!code ++]
      ) {
        // .
        // .
        // .
      }
    }
  }
}
```

### transformFor

Теперь, когда мы преодолели препятствие, давайте реализуем трансформер, используя то, что у нас есть, как обычно.
Осталось совсем немного, давайте постараемся!

Как и в случае с v-if, это также включает структуру, поэтому давайте реализуем это с помощью `createStructuralDirectiveTransform`.

Я думаю, было бы легче понять, если бы я написал объяснение с кодом, поэтому я предоставлю код с объяснениями ниже. Однако, пожалуйста, попробуйте реализовать это самостоятельно, читая исходный код, прежде чем смотреть на это!

```ts
// Это реализация основной структуры, похожая на v-if.
// Она выполняет processFor в соответствующем месте и генерирует codegenNode в соответствующем месте.
// processFor - это самая сложная реализация.
export const transformFor = createStructuralDirectiveTransform(
  'for',
  (node, dir, context) => {
    return processFor(node, dir, context, forNode => {
      // Как и ожидалось, генерируем код для вызова renderList.
      const renderExp = createCallExpression(context.helper(RENDER_LIST), [
        forNode.source,
      ]) as ForRenderListExpression

      // Генерируем codegenNode для Fragment, который служит контейнером для v-for.
      forNode.codegenNode = createVNodeCall(
        context,
        context.helper(FRAGMENT),
        undefined,
        renderExp,
      ) as ForCodegenNode

      // процесс codegen (выполняется после парсинга и сбора идентификаторов в processFor)
      return () => {
        const { children } = forNode
        const childBlock = (children[0] as ElementNode).codegenNode as VNodeCall

        renderExp.arguments.push(
          createFunctionExpression(
            createForLoopParams(forNode.parseResult),
            childBlock,
            true /* force newline */,
          ) as ForIteratorExpression,
        )
      }
    })
  },
)

export function processFor(
  node: ElementNode,
  dir: DirectiveNode,
  context: TransformContext,
  processCodegen?: (forNode: ForNode) => (() => void) | undefined,
) {
  // Разбираем выражение v-for.
  // На этапе parseResult идентификаторы каждого Node уже собраны.
  const parseResult = parseForExpression(
    dir.exp as SimpleExpressionNode,
    context,
  )

  const { addIdentifiers, removeIdentifiers } = context

  const { source, value, key, index } = parseResult!

  const forNode: ForNode = {
    type: NodeTypes.FOR,
    loc: dir.loc,
    source,
    valueAlias: value,
    keyAlias: key,
    parseResult: parseResult!,
    children: [node],
  }

  // Заменяем Node на forNode.
  context.replaceNode(forNode)

  if (!context.isBrowser) {
    // Добавляем собранные идентификаторы в контекст.
    value && addIdentifiers(value)
    key && addIdentifiers(key)
    index && addIdentifiers(index)
  }

  // Генерируем код (это позволяет пропустить добавление префикса к локальным переменным)
  const onExit = processCodegen && processCodegen(forNode)

  return () => {
    value && removeIdentifiers(value)
    key && removeIdentifiers(key)
    index && removeIdentifiers(index)

    if (onExit) onExit()
  }
}

// Разбираем выражение, переданное в v-for, используя регулярные выражения.
const forAliasRE = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/
const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/
const stripParensRE = /^\(|\)$/g

export interface ForParseResult {
  source: ExpressionNode
  value: ExpressionNode | undefined
  key: ExpressionNode | undefined
  index: ExpressionNode | undefined
}

export function parseForExpression(
  input: SimpleExpressionNode,
  context: TransformContext,
): ForParseResult | undefined {
  const loc = input.loc
  const exp = input.content
  const inMatch = exp.match(forAliasRE)

  if (!inMatch) return

  const [, LHS, RHS] = inMatch
  const result: ForParseResult = {
    source: createAliasExpression(
      loc,
      RHS.trim(),
      exp.indexOf(RHS, LHS.length),
    ),
    value: undefined,
    key: undefined,
    index: undefined,
  }

  if (!context.isBrowser) {
    result.source = processExpression(
      result.source as SimpleExpressionNode,
      context,
    )
  }

  let valueContent = LHS.trim().replace(stripParensRE, '').trim()
  const iteratorMatch = valueContent.match(forIteratorRE)
  const trimmedOffset = LHS.indexOf(valueContent)

  if (iteratorMatch) {
    valueContent = valueContent.replace(forIteratorRE, '').trim()
    const keyContent = iteratorMatch[1].trim()
    let keyOffset: number | undefined
    if (keyContent) {
      keyOffset = exp.indexOf(keyContent, trimmedOffset + valueContent.length)
      result.key = createAliasExpression(loc, keyContent, keyOffset)
      if (!context.isBrowser) {
        // Если не в режиме браузера, устанавливаем asParams в true и собираем идентификаторы key.
        result.key = processExpression(result.key, context, true)
      }
    }

    if (iteratorMatch[2]) {
      const indexContent = iteratorMatch[2].trim()
      if (indexContent) {
        result.index = createAliasExpression(
          loc,
          indexContent,
          exp.indexOf(
            indexContent,
            result.key
              ? keyOffset! + keyContent.length
              : trimmedOffset + valueContent.length,
          ),
        )
        if (!context.isBrowser) {
          // Если не в режиме браузера, устанавливаем asParams в true и собираем идентификаторы index.
          result.index = processExpression(result.index, context, true)
        }
      }
    }
  }

  if (valueContent) {
    result.value = createAliasExpression(loc, valueContent, trimmedOffset)
    if (!context.isBrowser) {
      // Если не в режиме браузера, устанавливаем asParams в true и собираем идентификаторы value.
      result.value = processExpression(result.value, context, true)
    }
  }

  return result
}

function createAliasExpression(
  range: SourceLocation,
  content: string,
  offset: number,
): SimpleExpressionNode {
  return createSimpleExpression(
    content,
    false,
    getInnerRange(range, offset, content.length),
  )
}

export function createForLoopParams(
  { value, key, index }: ForParseResult,
  memoArgs: ExpressionNode[] = [],
): ExpressionNode[] {
  return createParamsList([value, key, index, ...memoArgs])
}

function createParamsList(
  args: (ExpressionNode | undefined)[],
): ExpressionNode[] {
  let i = args.length
  while (i--) {
    if (args[i]) break
  }
  return args
    .slice(0, i + 1)
    .map((arg, i) => arg || createSimpleExpression(`_`.repeat(i + 1), false))
}
```

Теперь осталась только реализация renderList, которая фактически включена в скомпилированный код, и реализация регистрации трансформера. Если мы сможем реализовать это, v-for должен заработать!

Давайте попробуем запустить это!

![v_for](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/v_for.png)

Похоже, все идет хорошо.

Исходный код до этого момента: [GitHub](https://github.com/chibivue-land/chibivue/tree/main/book/impls/50_basic_template_compiler/050_v_for)
