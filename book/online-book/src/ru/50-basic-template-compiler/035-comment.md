# Реализация комментариев

## Целевой интерфейс разработчика

```ts
import { createApp, defineComponent } from 'chibivue'

const App = defineComponent({
  template: `
  <!-- this is header. -->
  <header>header</header>

  <!-- 
    this is main.
    main content is here!
  -->
  <main>main</main>

  <!-- this is footer -->
  <footer>footer</footer>`,
})

const app = createApp(App)

app.mount('#app')
```

В дальнейших объяснениях нет необходимости.

## Реализация AST и Parser

Что касается того, как реализовать комментарии, на первый взгляд кажется, что мы можем просто игнорировать их при парсинге.

Однако в Vue комментарии, написанные в шаблоне, выводятся в HTML как есть.

Другими словами, комментарии также должны быть отрендерены, поэтому необходимо иметь представление в VNode, и компилятор также должен выводить этот код.
Кроме того, необходима операция для генерации узла комментария.

Сначала давайте реализуем AST и parser.

### AST

```ts
export const enum NodeTypes {
  // .
  // .
  COMMENT,
  // .
  // .
  // .
}

export interface CommentNode extends Node {
  type: NodeTypes.COMMENT
  content: string
}

export type TemplateChildNode =
  | ElementNode
  | TextNode
  | InterpolationNode
  | CommentNode
```

### Parser

Пока что давайте выбрасывать ошибку.

```ts
function parseChildren(
  context: ParserContext,
  ancestors: ElementNode[],
): TemplateChildNode[] {
  // .
  // .
  // .
  if (startsWith(s, '{{')) {
    node = parseInterpolation(context)
  } else if (s[0] === '<') {
    if (s[1] === '!') {
      // https://html.spec.whatwg.org/multipage/parsing.html#markup-declaration-open-state
      if (startsWith(s, '<!--')) {
        node = parseComment(context)
      }
    } else if (/[a-z]/i.test(s[1])) {
      node = parseElement(context, ancestors)
    }
  }
  // .
  // .
  // .
}

function parseComment(context: ParserContext): CommentNode {
  const start = getCursor(context)
  let content: string

  // Обычный комментарий.
  const match = /--(\!)?>/.exec(context.source)
  if (!match) {
    content = context.source.slice(4)
    advanceBy(context, context.source.length)
    throw new Error('EOF_IN_COMMENT') // TODO: обработка ошибок
  } else {
    if (match.index <= 3) {
      throw new Error('ABRUPT_CLOSING_OF_EMPTY_COMMENT') // TODO: обработка ошибок
    }
    if (match[1]) {
      throw new Error('INCORRECTLY_CLOSED_COMMENT') // TODO: обработка ошибок
    }
    content = context.source.slice(4, match.index)

    const s = context.source.slice(0, match.index)
    let prevIndex = 1,
      nestedIndex = 0
    while ((nestedIndex = s.indexOf('<!--', prevIndex)) !== -1) {
      advanceBy(context, nestedIndex - prevIndex + 1)
      if (nestedIndex + 4 < s.length) {
        throw new Error('NESTED_COMMENT') // TODO: обработка ошибок
      }
      prevIndex = nestedIndex + 1
    }
    advanceBy(context, match.index + match[0].length - prevIndex + 1)
  }

  return {
    type: NodeTypes.COMMENT,
    content,
    loc: getSelection(context, start),
  }
}
```

## Генерация кода

Добавим VNode, который представляет Comment в runtime-core.

```ts
export const Comment = Symbol()
export type VNodeTypes =
  | string
  | Component
  | typeof Text
  | typeof Comment
  | typeof Fragment
```

Реализуем функцию под названием createCommentVNode и выставим ее как helper.

В codegen генерируем код, который вызывает createCommentVNode.

```ts
export function createCommentVNode(text: string = ''): VNode {
  return createVNode(Comment, null, text)
}
```

```ts
const genNode = (
  node: CodegenNode,
  context: CodegenContext,
  option: CompilerOptions,
) => {
  switch (node.type) {
    // .
    // .
    // .
    case NodeTypes.COMMENT:
      genComment(node, context)
      break
    // .
    // .
    // .
  }
}

function genComment(node: CommentNode, context: CodegenContext) {
  const { push, helper } = context
  push(`${helper(CREATE_COMMENT)}(${JSON.stringify(node.content)})`, node)
}
```

## Рендеринг

Давайте реализуем рендерер.

Как обычно, добавим ветвь для случая Comment в patch и сгенерируем комментарий при монтировании.

Что касается patch, поскольку он статический в этот раз, я не буду делать ничего особенного. (В коде это просто присваивание как есть.)

```ts
const patch = (
  n1: VNode | null,
  n2: VNode,
  container: RendererElement,
  anchor: RendererElement | null,
  parentComponent: ComponentInternalInstance | null,
) => {
  const { type, ref, shapeFlag } = n2
  if (type === Text) {
    processText(n1, n2, container, anchor)
  } else if (type === Comment) {
    processCommentNode(n1, n2, container, anchor)
  } //.
  //.
  //.
}

const processCommentNode = (
  n1: VNode | null,
  n2: VNode,
  container: RendererElement,
  anchor: RendererElement | null,
) => {
  if (n1 == null) {
    hostInsert(
      (n2.el = hostCreateComment((n2.children as string) || '')), // Реализуйте hostCreateComment на стороне nodeOps!
      container,
      anchor,
    )
  } else {
    n2.el = n1.el
  }
}
```

Ну, вы должны были реализовать комментарии к этому моменту. Давайте проверим фактическую работу!

Исходный код до этого момента: [GitHub](https://github.com/chibivue-land/chibivue/tree/main/book/impls/50_basic_template_compiler/035_comment)
