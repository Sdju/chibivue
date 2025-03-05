# Компиляция блока шаблона

## Переключение компилятора

`descriptor.script.content` и `descriptor.template.content` содержат исходный код каждой секции.  
Давайте успешно скомпилируем их. Начнем с секции шаблона.  
У нас уже есть компилятор шаблонов.  
Однако, как вы можете видеть из следующего кода,

```ts
export const generate = ({
  children,
}: {
  children: TemplateChildNode[]
}): string => {
  return `return function render(_ctx) {
  with (_ctx) {
    const { h } = ChibiVue;
    return ${genNode(children[0])};
  }
}`
}
```

Это предполагает, что он будет использоваться с конструктором Function, поэтому он включает оператор `return` в начале.  
В компиляторе SFC мы хотим только генерировать функцию рендеринга, поэтому давайте сделаем возможным ветвление с помощью опций компилятора.  
Давайте сделаем возможным получение опций в качестве второго аргумента компилятора и указание флага под названием `isBrowser`.  
Когда эта переменная равна `true`, он выводит код, который предполагает, что он будет использоваться с `new` в рантайме, а когда она равна `false`, он просто генерирует код.

```sh
pwd # ~
touch packages/compiler-core/options.ts
```

`packages/compiler-core/options.ts`

```ts
export type CompilerOptions = {
  isBrowser?: boolean
}
```

`~/packages/compiler-dom/index.ts`

```ts
export function compile(template: string, option?: CompilerOptions) {
  const defaultOption: Required<CompilerOptions> = { isBrowser: true }
  if (option) Object.assign(defaultOption, option)
  return baseCompile(template, defaultOption)
}
```

`~/packages/compiler-core/compile.ts`

```ts
export function baseCompile(
  template: string,
  option: Required<CompilerOptions>,
) {
  const parseResult = baseParse(template.trim())
  const code = generate(parseResult, option)
  return code
}
```

`~/packages/compiler-core/codegen.ts`

```ts
export const generate = (
  {
    children,
  }: {
    children: TemplateChildNode[]
  },
  option: Required<CompilerOptions>,
): string => {
  return `${option.isBrowser ? 'return ' : ''}function render(_ctx) {
  const { h } = ChibiVue;
  return ${genNode(children[0])};
}`
}
```

Я также добавил оператор импорта. Я изменил его, чтобы добавить сгенерированный исходный код в массив `output`.

```ts
import type { Plugin } from 'vite'
import { createFilter } from 'vite'
import { parse } from '../../compiler-sfc'
import { compile } from '../../compiler-dom'

export default function vitePluginChibivue(): Plugin {
  const filter = createFilter(/\.vue$/)

  return {
    name: 'vite:chibivue',

    transform(code, id) {
      if (!filter(id)) return

      const outputs = []
      outputs.push("import * as ChibiVue from 'chibivue'\n")

      const { descriptor } = parse(code, { filename: id })
      const templateCode = compile(descriptor.template?.content ?? '', {
        isBrowser: false,
      })
      outputs.push(templateCode)

      outputs.push('\n')
      outputs.push(`export default { render }`)

      return { code: outputs.join('\n') }
    },
  }
}
```

## Проблемы

Теперь вы должны быть в состоянии скомпилировать функцию рендеринга. Давайте проверим это в исходном коде браузера.

Однако есть небольшая проблема.

При привязке данных к шаблону, я думаю, вы используете оператор `with`. \
Однако из-за природы Vite, обрабатывающего ESM, он не может обрабатывать код, который работает только в нестрогом режиме (sloppy mode) и не может обрабатывать операторы `with`.  
До сих пор это не было проблемой, потому что мы просто передавали код (строки), содержащий операторы `with`, конструктору Function и делали его функцией в браузере, но теперь это вызывает ошибку. \
Вы должны увидеть ошибку вроде этой:

> Strict mode code may not include a with statement

Это также описано в официальной документации Vite как совет по устранению неполадок.

[Syntax Error / Type Error Occurs (Vite)](https://vitejs.dev/guide/troubleshooting.html#syntax-error-type-error-occurs)

В качестве временного решения давайте попробуем генерировать код, который не включает оператор `with`, когда он не находится в режиме браузера.

В частности, для данных, которые нужно привязать, давайте попробуем управлять этим, добавляя префикс `_ctx.` вместо использования оператора `with`.\
Поскольку это временное решение, оно не очень строгое, но я думаю, что оно будет работать в общем случае.\
(Правильное решение будет реализовано в следующей главе.)

```ts
export const generate = (
  {
    children,
  }: {
    children: TemplateChildNode[]
  },
  option: Required<CompilerOptions>,
): string => {
  // Генерируем код, который не включает оператор `with`, когда `isBrowser` равно false
  return `${option.isBrowser ? 'return ' : ''}function render(_ctx) {
    ${option.isBrowser ? 'with (_ctx) {' : ''}
      const { h } = ChibiVue;
      return ${genNode(children[0], option)};
    ${option.isBrowser ? '}' : ''}
}`
}

// .
// .
// .

const genNode = (
  node: TemplateChildNode,
  option: Required<CompilerOptions>,
): string => {
  switch (node.type) {
    case NodeTypes.ELEMENT:
      return genElement(node, option)
    case NodeTypes.TEXT:
      return genText(node)
    case NodeTypes.INTERPOLATION:
      return genInterpolation(node, option)
    default:
      return ''
  }
}

const genElement = (
  el: ElementNode,
  option: Required<CompilerOptions>,
): string => {
  return `h("${el.tag}", {${el.props
    .map(prop => genProp(prop, option))
    .join(', ')}}, [${el.children.map(it => genNode(it, option)).join(', ')}])`
}

const genProp = (
  prop: AttributeNode | DirectiveNode,
  option: Required<CompilerOptions>,
): string => {
  switch (prop.type) {
    case NodeTypes.ATTRIBUTE:
      return `${prop.name}: "${prop.value?.content}"`
    case NodeTypes.DIRECTIVE: {
      switch (prop.name) {
        case 'on':
          return `${toHandlerKey(prop.arg)}: ${
            option.isBrowser ? '' : '_ctx.' // -------------------- Здесь
          }${prop.exp}`
        default:
          // TODO: другие директивы
          throw new Error(`unexpected directive name. got "${prop.name}"`)
      }
    }
    default:
      throw new Error(`unexpected prop type.`)
  }
}

// .
// .
// .

const genInterpolation = (
  node: InterpolationNode,
  option: Required<CompilerOptions>,
): string => {
  return `${option.isBrowser ? '' : '_ctx.'}${node.content}` // ------------ Здесь
}
```

![compile_sfc_render](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/compile_sfc_render.png)

Похоже, что компиляция прошла успешно. Все, что осталось, это извлечь скрипт таким же образом и поместить его в экспорт по умолчанию.

Исходный код до этого момента:  
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/10_minimum_example/070_sfc_compiler3)
