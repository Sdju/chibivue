# Компиляция блока скрипта

## Что мы хотим сделать

Теперь исходная секция скрипта SFC выглядит так:

```ts
export default {
  setup() {},
}
```

Я хочу извлечь только следующую часть:

```ts
  {
  setup() {},
}
```

Есть ли способ сделать это?

Если я смогу извлечь эту часть, я смогу красиво смешать ее с ранее сгенерированной функцией рендеринга и экспортировать следующим образом:

```ts
const _sfc_main = {
  setup() {},
}

export default { ..._sfc_main, render }
```

## Использование внешних библиотек

Для достижения вышеуказанного я буду использовать следующие две библиотеки:

- @babel/parser
- magic-string

### Babel

https://babeljs.io

[Что такое Babel](https://babeljs.io/docs)

Возможно, вы слышали о Babel, если знакомы с JavaScript. \
Babel - это набор инструментов, используемый для преобразования JavaScript в обратно совместимые версии. \
Проще говоря, это компилятор (транспилятор) из JS в JS. 

В данном случае я буду использовать Babel не только как компилятор, но и как парсер. \
Babel имеет внутренний парсер для преобразования в AST, так как он играет роль компилятора. 

AST расшифровывается как Abstract Syntax Tree (Абстрактное синтаксическое дерево), которое представляет собой представление кода JavaScript. \
Вы можете найти спецификацию AST здесь (https://github.com/estree/estree). \
Хотя вы можете обратиться к файлу GitHub md, я кратко объясню AST в JavaScript. \
Вся программа представлена узлом AST Program, который содержит массив операторов (представлено с использованием интерфейсов TS для ясности).

```ts
interface Program {
  body: Statement[]
}
```

Statement представляет "оператор" в JavaScript, который является набором операторов. \
Примеры включают "оператор объявления переменной", "оператор if", "оператор for" и "блочный оператор".

```ts
interface Statement {}

interface VariableDeclaration extends Statement {
  /* опущено */
}

interface IfStatement extends Statement {
  /* опущено */
}

interface ForStatement extends Statement {
  /* опущено */
}

interface BlockStatement extends Statement {
  body: Statement[]
}
// И много других
```

Операторы обычно имеют "выражение" в большинстве случаев. \
Выражение - это то, что может быть присвоено переменной. \
Примеры включают "объект", "бинарную операцию" и "вызов функции".

```ts
interface Expression {}

interface BinaryExpression extends Expression {
  operator: '+' | '-' | '*' | '/' // Есть много других, но опущено
  left: Expression
  right: Expression
}

interface ObjectExpression extends Expression {
  properties: Property[] // опущено
}

interface CallExpression extends Expression {
  callee: Expression
  arguments: Expression[]
}

// И много других
```

Если мы рассмотрим оператор if, он имеет следующую структуру:

```ts
interface IfStatement extends Statement {
  test: Expression // условие
  consequent: Statement // операторы, которые будут выполнены, если условие истинно
  alternate: Statement | null // операторы, которые будут выполнены, если условие ложно
}
```

Таким образом, синтаксис JavaScript парсится в вышеупомянутый AST. \
Я думаю, это объяснение легко понять для тех, кто уже реализовал компилятор шаблонов для chibivue. (Это то же самое)

Причина, по которой я использую Babel, двояка.\
Во-первых, это просто потому, что это хлопотно. \
Если вы реализовывали парсер раньше, технически возможно реализовать парсер JS, обращаясь к estree. \
Однако это очень хлопотно, и это не очень важно для цели "углубления понимания Vue" в данном случае. \
Другая причина в том, что официальный Vue также использует Babel для этой части.

### magic-string

https://github.com/rich-harris/magic-string

Есть еще одна библиотека, которую я хочу использовать. \
Эта библиотека также используется официальным Vue. \
Это библиотека, которая делает манипуляции со строками проще.

```ts
const input = 'Hello'
const s = new MagicString(input)
```

Вы можете создать экземпляр таким образом и использовать удобные методы, предоставляемые экземпляром, для манипуляции строками. \
Вот несколько примеров:

```ts
s.append('!!!') // Добавить в конец
s.prepend('message: ') // Добавить в начало
s.overwrite(9, 13, 'こんにちは') // Перезаписать в диапазоне
```

Нет необходимости использовать его принудительно, но я буду использовать его, чтобы соответствовать официальному Vue.

Будь то Babel или magic-string, вам не нужно понимать фактическое использование на данный момент. \
Я объясню и согласую реализацию позже, так что достаточно иметь общее понимание сейчас.

## Переписывание экспорта по умолчанию скрипта

Чтобы повторить текущую цель:

```ts
export default {
  setup() {},
  // Другие опции
}
```

Я хочу переписать код выше в:

```ts
const _sfc_main = {
  setup() {},
  // Другие опции
}

export default { ..._sfc_main, render }
```

Другими словами, если я смогу извлечь цель экспорта из оператора экспорта исходного кода и присвоить ее переменной под названием `_sfc_main`, я достигну цели.

Сначала давайте установим необходимые библиотеки.

```sh
pwd # ~
ni @babel/parser magic-string
```

Создайте файл под названием "rewriteDefault.ts".

```sh
pwd # ~
touch packages/compiler-sfc/rewriteDefault.ts
```

Убедитесь, что функция "rewriteDefault" может получать целевой исходный код как "input" и имя переменной для привязки как "as".  \
Верните преобразованный исходный код как возвращаемое значение.

`~/packages/compiler-sfc/rewriteDefault.ts`

```ts
export function rewriteDefault(input: string, as: string): string {
  // TODO:
  return ''
}
```

Сначала давайте обработаем случай, когда объявление экспорта не существует. \
Поскольку нет экспорта, привяжем пустой объект и закончим.

```ts
const defaultExportRE = /((?:^|\n|;)\s*)export(\s*)default/
const namedDefaultExportRE = /((?:^|\n|;)\s*)export(.+)(?:as)?(\s*)default/s

export function rewriteDefault(input: string, as: string): string {
  if (!hasDefaultExport(input)) {
    return input + `\nconst ${as} = {}`
  }

  // TODO:
  return ''
}

export function hasDefaultExport(input: string): boolean {
  return defaultExportRE.test(input) || namedDefaultExportRE.test(input)
}
```

Здесь появляются парсер Babel и magic-string.

```ts
import { parse } from '@babel/parser'
import MagicString from 'magic-string'
// .
// .
export function rewriteDefault(input: string, as: string): string {
  // .
  // .
  const s = new MagicString(input)
  const ast = parse(input, {
    sourceType: 'module',
  }).program.body
  // .
  // .
}
```

Отсюда мы будем манипулировать строкой `s` на основе JavaScript AST (Abstract Syntax Tree), полученного парсером Babel. \
Хотя это немного длинно, я предоставлю дополнительные объяснения в комментариях в исходном коде.\
В основном, мы обходим AST и пишем условные операторы на основе свойства `type`, и манипулируем строкой `s` с помощью методов `magic-string`.

```ts
export function rewriteDefault(input: string, as: string): string {
  // .
  // .
  ast.forEach(node => {
    // В случае экспорта по умолчанию
    if (node.type === 'ExportDefaultDeclaration') {
      if (node.declaration.type === 'ClassDeclaration') {
        // Если это `export default class Hoge {}`, заменить его на `class Hoge {}`
        s.overwrite(node.start!, node.declaration.id.start!, `class `)
        // Затем добавить код вроде `const ${as} = Hoge;` в конец.
        s.append(`\nconst ${as} = ${node.declaration.id.name}`)
      } else {
        // Для других экспортов по умолчанию заменить часть объявления на объявление переменной.
        // например 1) `export default { setup() {}, }`  ->  `const ${as} = { setup() {}, }`
        // например 2) `export default Hoge`  ->  `const ${as} = Hoge`
        s.overwrite(node.start!, node.declaration.start!, `const ${as} = `)
      }
    }

    // Может быть экспорт по умолчанию даже в случае именованного экспорта.
    // В основном 3 паттерна
    //   1. В случае объявления вроде `export { default } from "source";`
    //   2. В случае объявления вроде `export { hoge as default }` from 'source'
    //   3. В случае объявления вроде `export { hoge as default }`
    if (node.type === 'ExportNamedDeclaration') {
      for (const specifier of node.specifiers) {
        if (
          specifier.type === 'ExportSpecifier' &&
          specifier.exported.type === 'Identifier' &&
          specifier.exported.name === 'default'
        ) {
          // Если есть ключевое слово `from`
          if (node.source) {
            if (specifier.local.name === 'default') {
              // 1. В случае объявления вроде `export { default } from "source";`
              // В этом случае извлечь его в оператор импорта и дать ему имя, затем привязать к конечной переменной.
              // например) `export { default } from "source";`  ->  `import { default as __VUE_DEFAULT__ } from 'source'; const ${as} = __VUE_DEFAULT__`
              const end = specifierEnd(input, specifier.local.end!, node.end!)
              s.prepend(
                `import { default as __VUE_DEFAULT__ } from '${node.source.value}'\n`,
              )
              s.overwrite(specifier.start!, end, ``)
              s.append(`\nconst ${as} = __VUE_DEFAULT__`)
              continue
            } else {
              // 2. В случае объявления вроде `export { hoge as default }` from 'source'
              // В этом случае переписать все спецификаторы как есть в оператор импорта, и привязать переменную, которая является default, к конечной переменной.
              // например) `export { hoge as default } from "source";`  ->  `import { hoge } from 'source'; const ${as} = hoge
              const end = specifierEnd(
                input,
                specifier.exported.end!,
                node.end!,
              )
              s.prepend(
                `import { ${input.slice(
                  specifier.local.start!,
                  specifier.local.end!,
                )} } from '${node.source.value}'\n`,
              )

              // 3. В случае объявления вроде `export { hoge as default }`
              // В этом случае просто привязать его к конечной переменной.
              s.overwrite(specifier.start!, end, ``)
              s.append(`\nconst ${as} = ${specifier.local.name}`)
              continue
            }
          }
          const end = specifierEnd(input, specifier.end!, node.end!)
          s.overwrite(specifier.start!, end, ``)
          s.append(`\nconst ${as} = ${specifier.local.name}`)
        }
      }
    }
  })
  return s.toString()
}

// Вычислить конец оператора объявления
function specifierEnd(input: string, end: number, nodeEnd: number | null) {
  // export { default   , foo } ...
  let hasCommas = false
  let oldEnd = end
  while (end < nodeEnd!) {
    if (/\s/.test(input.charAt(end))) {
      end++
    } else if (input.charAt(end) === ',') {
      end++
      hasCommas = true
      break
    } else if (input.charAt(end) === '}') {
      break
    }
  }
  return hasCommas ? end : oldEnd
}
```

Теперь вы можете переписать экспорт по умолчанию. \
Давайте попробуем использовать его в плагине.

```ts
import type { Plugin } from 'vite'
import { createFilter } from 'vite'
import { parse, rewriteDefault } from '../../compiler-sfc'
import { compile } from '../../compiler-dom'

export default function vitePluginChibivue(): Plugin {
  const filter = createFilter(/\.vue$/)

  return {
    name: 'vite:chibivue',

    transform(code, id) {
      if (!filter(id)) return

      const outputs = []
      outputs.push("import * as ChibiVue from 'chibivue'")

      const { descriptor } = parse(code, { filename: id })

      // --------------------------- Отсюда
      const SFC_MAIN = '_sfc_main'
      const scriptCode = rewriteDefault(
        descriptor.script?.content ?? '',
        SFC_MAIN,
      )
      outputs.push(scriptCode)
      // --------------------------- До сюда

      const templateCode = compile(descriptor.template?.content ?? '', {
        isBrowser: false,
      })
      outputs.push(templateCode)

      outputs.push('\n')
      outputs.push(`export default { ...${SFC_MAIN}, render }`) // Здесь

      return { code: outputs.join('\n') }
    },
  }
}
```

Перед этим давайте сделаем небольшую модификацию.

`~/packages/runtime-core/component.ts`

```ts
export const setupComponent = (instance: ComponentInternalInstance) => {
  // .
  // .
  // .
  // Добавить опцию render компонента в экземпляр
  const { render } = component
  if (render) {
    instance.render = render as InternalRenderFunction
  }
}
```

Теперь вы должны быть в состоянии рендерить!!!

![render_sfc](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/render_sfc.png)

Стили не применяются, потому что они не поддерживаются, но теперь вы можете рендерить компонент.