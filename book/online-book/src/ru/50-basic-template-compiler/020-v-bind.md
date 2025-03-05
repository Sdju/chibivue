# Реализация директивы (v-bind)

## Подход

Теперь давайте реализуем директиву, которая является сущностью Vue.js.  
Как обычно, мы применим директиву к трансформеру, и интерфейс, который там появляется, называется DirectiveTransform.  
DirectiveTransform принимает DirectiveNode и ElementNode в качестве аргументов и возвращает преобразованное Property.

```ts
export type DirectiveTransform = (
  dir: DirectiveNode,
  node: ElementNode,
  context: TransformContext,
) => DirectiveTransformResult

export interface DirectiveTransformResult {
  props: Property[]
}
```

Сначала давайте проверим интерфейс разработчика, к которому мы стремимся в этот раз.

```ts
import { createApp, defineComponent } from 'chibivue'

const App = defineComponent({
  setup() {
    const bind = { id: 'some-id', class: 'some-class', style: 'color: red' }
    return { count: 1, bind }
  },

  template: `<div>
  <p v-bind:id="count"> v-bind:id="count" </p>
  <p :id="count * 2"> :id="count * 2" </p>

  <p v-bind:["style"]="bind.style"> v-bind:["style"]="bind.style" </p>
  <p :["style"]="bind.style"> :["style"]="bind.style" </p>

  <p v-bind="bind"> v-bind="bind" </p>

  <p :style="{ 'font-weight': 'bold' }"> :style="{ font-weight: 'bold' }" </p>
  <p :style="'font-weight: bold;'"> :style="'font-weight: bold;'" </p>

  <p :class="'my-class my-class2'"> :class="'my-class my-class2'" </p>
  <p :class="['my-class']"> :class="['my-class']" </p>
  <p :class="{ 'my-class': true }"> :class="{ 'my-class': true }" </p>
  <p :class="{ 'my-class': false }"> :class="{ 'my-class': false }" </p>
</div>`,
})

const app = createApp(App)

app.mount('#app')
```

Существуют различные обозначения для v-bind. Пожалуйста, обратитесь к официальной документации для подробностей.  
Мы также будем обрабатывать class и style.

https://vuejs.org/api/built-in-directives.html#v-bind

## Модификация AST

Сначала давайте изменим AST. В настоящее время и exp, и arg являются простыми строками, поэтому нам нужно изменить их, чтобы они принимали ExpressionNode.

```ts
export interface DirectiveNode extends Node {
  type: NodeTypes.DIRECTIVE
  name: string
  exp: ExpressionNode | undefined // здесь
  arg: ExpressionNode | undefined // здесь
}
```

Позвольте мне снова объяснить name, arg и exp.  
name - это имя директивы, такое как v-bind или v-on. Это может быть on или bind.  
Поскольку мы реализуем v-bind в этот раз, это будет bind.

arg - это аргумент, указанный через :. Для v-bind это включает id и style.  
(В случае v-on это включает click и input.)

exp - это правая сторона. В случае v-bind:id="count", count включается.  
И exp, и arg могут динамически встраивать переменные, поэтому их типы - ExpressionNode.  
(Поскольку arg также может быть динамическим, как v-bind:[key]="count")

![dir_ast](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/dir_ast.drawio.png)

## Модификация парсера

Мы обновим реализацию парсера, чтобы следовать этой модификации AST. Мы будем парсить exp и arg как SimpleExpressionNode.

Мы также разберем @ используемый в v-on и # используемый в слотах.  
(Поскольку сложно рассматривать регулярные выражения (и сложно добавлять их постепенно во время объяснения), мы пока позаимствуем оригинальный код.)  
Ссылка: https://github.com/vuejs/core/blob/623ba514ec0f5adc897db90c0f986b1b6905e014/packages/compiler-core/src/parse.ts#L802

Поскольку код немного длинный, я объясню его, написав комментарии в коде.

```ts
function parseAttribute(
  context: ParserContext,
  nameSet: Set<string>,
): AttributeNode | DirectiveNode {
  // .
  // .
  // .
  // директива
  const loc = getSelection(context, start)
  // Регулярное выражение здесь заимствовано из исходного кода
  if (/^(v-[A-Za-z0-9-]|:|\.|@|#)/.test(name)) {
    const match =
      // Регулярное выражение здесь заимствовано из исходного кода
      /(?:^v-([a-z0-9-]+))?(?:(?::|^\.|^@|^#)(\[[^\]]+\]|[^\.]+))?(.+)?$/i.exec(
        name,
      )!

    // Проверяем совпадение части имени и обрабатываем как "bind", если начинается с ":"
    let dirName =
      match[1] ||
      (startsWith(name, ':') ? 'bind' : startsWith(name, '@') ? 'on' : '')

    let arg: ExpressionNode | undefined

    if (match[2]) {
      const startOffset = name.lastIndexOf(match[2])
      const loc = getSelection(
        context,
        getNewPosition(context, start, startOffset),
        getNewPosition(context, start, startOffset + match[2].length),
      )

      let content = match[2]
      let isStatic = true

      // Если это динамический аргумент как "[arg]", устанавливаем isStatic в false и извлекаем содержимое как content
      if (content.startsWith('[')) {
        isStatic = false
        if (!content.endsWith(']')) {
          console.error(`Invalid dynamic argument expression: ${content}`)
          content = content.slice(1)
        } else {
          content = content.slice(1, content.length - 1)
        }
      }

      arg = {
        type: NodeTypes.SIMPLE_EXPRESSION,
        content,
        isStatic,
        loc,
      }
    }

    return {
      type: NodeTypes.DIRECTIVE,
      name: dirName,
      exp: value && {
        type: NodeTypes.SIMPLE_EXPRESSION,
        content: value.content,
        isStatic: false,
        loc: value.loc,
      },
      loc,
      arg,
    }
  }
}
```

С этим мы смогли разобрать AST Node, который мы хотели обработать в этот раз.

## Реализация трансформера

Далее давайте напишем реализацию для преобразования этого AST в Codegen AST.  
Поскольку это немного сложно, я обобщил поток на следующей диаграмме. Пожалуйста, сначала посмотрите на нее.  
В общем, необходимые элементы - это есть ли аргументы для v-bind, является ли это class или style.  
※ Части, не связанные с обработкой в этот раз, опущены. (Пожалуйста, обратите внимание, что эта диаграмма не очень строгая.)

![dir_ast](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/transform_vbind.drawio.png)

Прежде всего, как предпосылка, поскольку директива в основном объявляется для элемента,  
трансформер, связанный с директивой, вызывается из transformElement.

Поскольку мы хотим реализовать v-bind в этот раз, мы реализуем функцию под названием transformVBind,  
но один момент, который следует отметить, это то, что эта функция преобразует только объявления, которые имеют args.

transformVBind имеет роль преобразования

```
v-bind:id="count"
```

в объект (на самом деле в Codegen Node, представляющий этот объект) вроде

```ts
{
  id: count
}
```

В оригинальной реализации также дается следующее объяснение:

> codegen for the entire props object. This transform here is only for v-bind _with_ args.

Цитата из: https://github.com/vuejs/core/blob/623ba514ec0f5adc897db90c0f986b1b6905e014/packages/compiler-core/src/transforms/vBind.ts#L13C1-L14C16

Как видно из потока, transformElement проверяет arg директивы и если его нет, то не выполняет transformVBind, а преобразует его в вызов функции mergeProps.

```vue
<p v-bind="bindingObject" class="my-class">hello</p>
```

↓

```ts
h('p', mergeProps(bindingObject, { class: 'my-class' }), 'hello')
```

Также для class и style они имеют различные интерфейсы разработчика, поэтому их нужно нормализовать.  
https://vuejs.org/api/built-in-directives.html#v-bind

Реализуйте функции под названием normalizeClass и normalizeStyle и примените их соответственно.

Если arg динамический, невозможно определить конкретный, поэтому реализуйте функцию под названием normalizeProps и вызовите ее. (Она вызывает normalizeClass и normalizeStyle внутри)

Теперь, когда мы реализовали это, давайте посмотрим, как это работает!

![vbind_test](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/vbind_test.png)

Выглядит отлично!

В следующий раз мы реализуем v-on.

Исходный код до этого момента:  
[GitHub](https://github.com/chibivue-land/chibivue/tree/main/book/impls/50_basic_template_compiler/020_v_bind)
