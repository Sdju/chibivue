# Модификаторы событий

## Что мы будем делать в этот раз

Поскольку мы реализовали директиву v-on в прошлый раз, давайте теперь реализуем модификаторы событий.

Vue.js имеет модификаторы, которые соответствуют preventDefault и stopPropagation.

https://vuejs.org/guide/essentials/event-handling.html

В этот раз давайте реализуем следующий интерфейс разработчика.

```ts
import { createApp, defineComponent, ref } from 'chibivue'

const App = defineComponent({
  setup() {
    const inputText = ref('')

    const buffer = ref('')
    const handleInput = (e: Event) => {
      const target = e.target as HTMLInputElement
      buffer.value = target.value
    }
    const submit = () => {
      inputText.value = buffer.value
      buffer.value = ''
    }

    return { inputText, buffer, handleInput, submit }
  },

  template: `<div>
    <form @submit.prevent="submit">
      <label>
        Input Data
        <input :value="buffer" @input="handleInput" />
      </label>
      <button>submit</button>
    </form>
    <p>inputText: {{ inputText }}</p>
</div>`,
})

const app = createApp(App)

app.mount('#app')
```

В частности, обратите внимание на следующую часть.

```html
<form @submit.prevent="submit"></form>
```

Здесь есть описание `@submit.prevent`. Это означает, что при вызове обработчика события submit выполняется `preventDefault`.

Если не включить `.prevent`, страница будет перезагружена при отправке формы.

## Реализация AST и Parser

Поскольку мы добавляем новый синтаксис в шаблон, необходимы изменения в Parser и AST.

Сначала давайте посмотрим на AST. Это очень просто: просто добавляем свойство под названием `modifiers` (массив строк) в `DirectiveNode`.

```ts
export interface DirectiveNode extends Node {
  type: NodeTypes.DIRECTIVE
  name: string
  exp: ExpressionNode | undefined
  arg: ExpressionNode | undefined
  modifiers: string[] // Добавляем это
}
```

Давайте реализуем Parser соответственно.

На самом деле, это очень легко, потому что оно уже включено в регулярное выражение, заимствованное из исходного кода.

```ts
function parseAttribute(
  context: ParserContext,
  nameSet: Set<string>,
): AttributeNode | DirectiveNode {
  // .
  // .
  // .
  const modifiers = match[3] ? match[3].slice(1).split('.') : [] // Извлекаем модификаторы из результата match
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
    modifiers, // Включаем в возвращаемое значение
  }
}
```

Да. С этим реализация AST и Parser завершена.

## compiler-dom/transform

Давайте немного рассмотрим текущую архитектуру компилятора.

Текущая конфигурация выглядит следующим образом.

![50-027-compiler-architecture](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/50-027-compiler-architecture.drawio.png)

Когда вы снова понимаете роли compiler-core и compiler-dom,  
compiler-core предоставляет функциональность компилятора, которая не зависит от DOM, такую как генерация и преобразование AST.

До сих пор мы реализовывали директиву v-on в compiler-core, но это просто преобразование нотации `@click="handle"` в объект `{ onClick: handle }`,  
Она не выполняет никакой обработки, которая зависит от DOM.

Теперь давайте посмотрим на то, что мы хотим реализовать в этот раз.  
В этот раз мы хотим сгенерировать код, который фактически выполняет `e.preventDefault()` или `e.stopPropagation()`.  
Эти функции сильно зависят от DOM.

Поэтому мы также реализуем трансформеры на стороне compiler-dom. Мы будем реализовывать трансформеры, связанные с DOM, здесь.

В compiler-core нам нужно рассмотреть взаимодействие между transform в compiler-core и transform, реализованным в compiler-dom.  
Взаимодействие заключается в том, как реализовать transform, реализованный в compiler-dom, при выполнении transform в compiler-core.

Итак, сначала давайте изменим интерфейс `DirectiveTransform`, реализованный в compiler-core.

```ts
export type DirectiveTransform = (
  dir: DirectiveNode,
  node: ElementNode,
  context: TransformContext,
  augmentor?: (ret: DirectiveTransformResult) => DirectiveTransformResult, // Добавлено
) => DirectiveTransformResult
```

Я добавил `augmentor`.  
Ну, это просто функция обратного вызова. Позволяя получать обратные вызовы как часть интерфейса `DirectiveTransform`, мы делаем функцию transform расширяемой.

В compiler-dom мы реализуем трансформер, который оборачивает трансформеры, реализованные в compiler-core.

```ts
// Пример реализации

// Реализация на стороне compiler-dom

import { transformOn as baseTransformOn } from 'compiler-core'

export const transformOn: DirectiveTransform = (dir, node, context) => {
  return baseTransformOn(dir, node, context, () => {
    /** Реализуем собственную реализацию compiler-dom здесь */
    return {
      /** */
    }
  })
}
```

И если вы передадите этот `transformOn`, реализованный на стороне compiler-dom, как опцию компилятору, это будет нормально.  
Вот диаграмма отношений.  
Вместо передачи всех трансформеров из compiler-dom, реализация по умолчанию реализована в compiler-core, и конфигурация позволяет добавлять дополнительные трансформеры.

![50-027-new-compiler-architecture](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/50-027-new-compiler-architecture.drawio.png)

С этим compiler-core может выполнять трансформеры без зависимости от DOM, а compiler-dom может реализовывать обработку, которая зависит от DOM, при выполнении трансформеров в compiler-core.

## Реализация трансформера

Теперь давайте реализуем трансформер на стороне compiler-dom.

Как мы должны его преобразовать? Пока что, поскольку есть различные типы модификаторов, даже если мы просто говорим "модификатор", давайте классифицируем их, чтобы мы могли учитывать будущие возможности.

В этот раз мы реализуем "модификатор события". Давайте начнем с извлечения его как `eventModifiers`.

```ts
const isEventModifier = makeMap(
  // управление распространением событий
  `stop,prevent,self`,
)

const resolveModifiers = (modifiers: string[]) => {
  const eventModifiers = []

  for (let i = 0; i < modifiers.length; i++) {
    const modifier = modifiers[i]
    if (isEventModifier(modifier)) {
      eventModifiers.push(modifier)
    }
  }

  return { eventModifiers }
}
```

Теперь, когда мы извлекли `eventModifiers`, как мы должны его использовать? В итоге мы реализуем вспомогательную функцию под названием `withModifiers` на стороне runtime-dom и преобразуем ее в выражение, которое вызывает эту функцию.

```ts
// runtime-dom/runtimeHelpers.ts

export const V_ON_WITH_MODIFIERS = Symbol()
```

```ts
export const transformOn: DirectiveTransform = (dir, node, context) => {
  return baseTransform(dir, node, context, baseResult => {
    const { modifiers } = dir
    if (!modifiers.length) return baseResult

    let { key, value: handlerExp } = baseResult.props[0]
    const { eventModifiers } = resolveModifiers(modifiers)

    if (eventModifiers.length) {
      handlerExp = createCallExpression(context.helper(V_ON_WITH_MODIFIERS), [
        handlerExp,
        JSON.stringify(eventModifiers),
      ])
    }

    return {
      props: [createObjectProperty(key, handlerExp)],
    }
  })
}
```

С этим реализация трансформера почти завершена.

Теперь давайте реализуем `withModifiers` на стороне compiler-dom.

## Реализация `withModifiers`

Давайте продолжим реализацию в runtime-dom/directives/vOn.ts.

Реализация очень проста.

Реализуем функцию-guard для модификаторов событий и реализуем ее так, чтобы она выполнялась столько раз, сколько модификаторов получено в массиве.

```ts
const modifierGuards: Record<string, (e: Event) => void | boolean> = {
  stop: e => e.stopPropagation(),
  prevent: e => e.preventDefault(),
  self: e => e.target !== e.currentTarget,
}

export const withModifiers = (fn: Function, modifiers: string[]) => {
  return (event: Event, ...args: unknown[]) => {
    for (let i = 0; i < modifiers.length; i++) {
      const guard = modifierGuards[modifiers[i]]
      if (guard && guard(event)) return
    }
    return fn(event, ...args)
  }
}
```

На этом реализация завершена.

Давайте проверим работу! Если содержимое ввода отражается на экране без перезагрузки страницы при нажатии кнопки, все в порядке!

Исходный код до этого момента: [GitHub](https://github.com/chibivue-land/chibivue/tree/main/book/impls/50_basic_template_compiler/027_event_modifier)

## Другие модификаторы

Теперь, когда мы зашли так далеко, давайте реализуем другие модификаторы.

Основной подход к реализации тот же.

Давайте классифицируем модификаторы следующим образом:

```ts
const keyModifiers = []
const nonKeyModifiers = []
const eventOptionModifiers = []
```

Затем сгенерируем необходимые карты и классифицируем их с помощью `resolveModifiers`.

Два момента, на которые нужно обратить внимание:

- Разница между именем модификатора и фактическим именем DOM API
- Реализация новой вспомогательной функции для выполнения с определенными событиями клавиш (withKeys)

Пожалуйста, попробуйте реализовать, читая фактический код!
Если вы дошли до этого момента, вы должны быть в состоянии это сделать.

Исходный код до этого момента: [GitHub](https://github.com/chibivue-land/chibivue/tree/main/book/impls/50_basic_template_compiler/027_event_modifier2)
