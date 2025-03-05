# Слоты компонентов

## Желаемый интерфейс разработчика

У нас уже есть реализация слотов в runtime для базовой системы компонентов.\
Однако мы все еще не можем обрабатывать слоты в шаблонах.

Мы хотим обрабатывать SFC следующим образом:\
(Хотя мы говорим SFC, на самом деле это реализация компилятора шаблонов.)

```vue
<!-- Comp.vue -->
<template>
  <p><slot name="default" /></p>
</template>
```

```vue
<!-- App.vue -->
<script>
import Comp from './Comp.vue'
export default {
  components: {
    Comp,
  },
  setup() {
    const count = ref(0)
    return { count }
  },
}
</script>

<template>
  <Comp>
    <template #default>
      <button @click="count++">count is: {{ count }}</button>
    </template>
  </Comp>
</template>
```

В Vue.js есть несколько типов слотов:

- Слоты по умолчанию (Default slots)
- Именованные слоты (Named slots)
- Слоты с областью видимости (Scoped slots)

Однако, как вы уже могли понять из реализации runtime, все они являются просто функциями обратного вызова. Давайте рассмотрим их еще раз.

Компоненты, подобные показанным выше, преобразуются в функции рендеринга следующим образом:

```js
h(Comp, null, {
  default: () =>
    h('button', { onClick: () => count.value++ }, `count is: ${count.value}`),
})
```

В шаблоне атрибут `name="default"` может быть опущен, но во время выполнения он все равно будет обрабатываться как слот с именем `default`. Мы реализуем компилятор для слотов по умолчанию после завершения реализации для именованных слотов.

## Реализация компилятора (определение слота)

Как обычно, мы будем реализовывать процессы парсинга и генерации кода, но на этот раз мы будем обрабатывать как определение слота, так и вставку слота.

Сначала давайте сосредоточимся на определении слота. Это та часть, которая представлена как `<slot name="my-slot"/>` на стороне дочернего компонента.

В runtime мы подготовим вспомогательную функцию под названием `renderSlot`, которая будет принимать слоты, вставленные через экземпляр компонента (через `ctx.$slot`), и их имена в качестве аргументов. Исходный код будет скомпилирован во что-то вроде:

```js
_renderSlot(_ctx.$slots, "my-slot")
```

Мы будем представлять определение слота как узел под названием `SlotOutletNode` в AST.\
Добавьте следующее определение в `ast.ts`.

```ts
export const enum ElementTypes {
  ELEMENT,
  COMPONENT,
  SLOT,
  TEMPLATE,
}

export type ElementNode = 
  | PlainElementNode 
  | ComponentNode 
  | SlotOutletNode

export interface SlotOutletNode extends BaseElementNode {
  tagType: ElementTypes.SLOT
  codegenNode: RenderSlotCall | undefined
}

export interface RenderSlotCall extends CallExpression {
  callee: typeof RENDER_SLOT
  arguments: [string, string | ExpressionNode]
}
```

Давайте напишем процесс парсинга для генерации этого AST.

В `parse.ts` задача простая: при парсинге тега, если это `"slot"`, изменить его на `ElementTypes.SLOT`.

```ts
function parseTag(context: ParserContext, type: TagType): ElementNode {
  let tagType = ElementTypes.ELEMENT
  if (tag === 'slot') {
    tagType = ElementTypes.SLOT
  } else if (isComponent(tag, context)) {
    tagType = ElementTypes.COMPONENT
  }
}
```

Теперь, когда мы достигли этой точки, следующим шагом является реализация трансформера для генерации `codegenNode`.\
Нам нужно создать `JS_CALL_EXPRESSION` для вспомогательной функции.

В качестве предварительного шага добавьте `RENDER_SLOT` в `runtimeHelper.ts`.

```ts
export const RENDER_LIST = Symbol()
export const RENDER_SLOT = Symbol()
export const MERGE_PROPS = Symbol()

export const helperNameMap: Record<symbol, string> = {
  [RENDER_LIST]: `renderList`,
  [RENDER_SLOT]: 'renderSlot',
  [MERGE_PROPS]: 'mergeProps',
}
```

Мы реализуем новый трансформер под названием `transformSlotOutlet`.\
Задача очень простая: когда встречается `ElementType.SLOT`, мы ищем `name` в `node.props` и генерируем `JS_CALL_EXPRESSION` для `RENDER_SLOT`.\
Мы также учитываем случаи, когда имя привязано, например `:name="slotName"`.

Поскольку это довольно просто, вот полный код трансформера (пожалуйста, прочитайте его).

```ts
import { camelize } from '../../shared'
import {
  type CallExpression,
  type ExpressionNode,
  NodeTypes,
  type SlotOutletNode,
  createCallExpression,
} from '../ast'
import { RENDER_SLOT } from '../runtimeHelpers'
import type { NodeTransform, TransformContext } from '../transform'
import { isSlotOutlet, isStaticArgOf, isStaticExp } from '../utils'

export const transformSlotOutlet: NodeTransform = (node, context) => {
  if (isSlotOutlet(node)) {
    const { loc } = node
    const { slotName } = processSlotOutlet(node, context)
    const slotArgs: CallExpression['arguments'] = [
      context.isBrowser ? `$slots` : `_ctx.$slots`,
      slotName,
    ]

    node.codegenNode = createCallExpression(
      context.helper(RENDER_SLOT),
      slotArgs,
      loc,
    )
  }
}

interface SlotOutletProcessResult {
  slotName: string | ExpressionNode
}

function processSlotOutlet(
  node: SlotOutletNode,
  context: TransformContext,
): SlotOutletProcessResult {
  let slotName: string | ExpressionNode = `"default"`

  const nonNameProps = []
  for (let i = 0; i < node.props.length; i++) {
    const p = node.props[i]
    if (p.type === NodeTypes.ATTRIBUTE) {
      if (p.value) {
        if (p.name === 'name') {
          slotName = JSON.stringify(p.value.content)
        } else {
          p.name = camelize(p.name)
          nonNameProps.push(p)
        }
      }
    } else {
      if (p.name === 'bind' && isStaticArgOf(p.arg, 'name')) {
        if (p.exp) slotName = p.exp
      } else {
        if (p.name === 'bind' && p.arg && isStaticExp(p.arg)) {
          p.arg.content = camelize(p.arg.content)
        }
        nonNameProps.push(p)
      }
    }
  }

  return { slotName }
}
```

В будущем мы также добавим здесь исследование пропсов для слотов с областью видимости.

Один момент, который следует отметить: элемент `<slot />` также будет перехвачен `transformElement`, поэтому мы добавим реализацию для его пропуска, когда встречается `ElementTypes.SLOT`.

Вот `transformElement.ts`.

```ts
export const transformElement: NodeTransform = (node, context) => {
  return function postTransformElement() {
    node = context.currentNode!

    if (
      !(
        node.type === NodeTypes.ELEMENT &&
        (node.tagType === ElementTypes.ELEMENT ||
          node.tagType === ElementTypes.COMPONENT)
      )
    ) {
      return
    }

    // ...
  }
}
```

Наконец, зарегистрировав `transformSlotOutlet` в `compile.ts`, компиляция должна быть возможна.

```ts
export function getBaseTransformPreset(): TransformPreset {
  return [
    [
      transformIf,
      transformFor,
      transformExpression,
      transformSlotOutlet,
      transformElement,
    ],
    { bind: transformBind, on: transformOn },
  ]
}
```

Мы еще не реализовали runtime функцию `renderSlot`, поэтому давайте сделаем это последним для завершения реализации определения слота.

Давайте реализуем `packages/runtime-core/helpers/renderSlot.ts`.

```ts
import { Fragment, type VNode, createVNode } from '../vnode'
import type { Slots } from '../componentSlots'

export function renderSlot(slots: Slots, name: string): VNode {
  let slot = slots[name]
  if (!slot) {
    slot = () => []
  }

  return createVNode(Fragment, {}, slot())
}
```

Реализация определения слота теперь завершена.\
Далее давайте реализуем компилятор для стороны вставки слота!

Исходный код до этого момента:\
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/50_basic_template_compiler/080_component_slot_outlet)

## Вставка слота

TBD
