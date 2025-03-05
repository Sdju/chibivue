# Поддержка обработчиков событий и атрибутов

## Просто отображать это слишком скучно

Поскольку у нас есть такая возможность, давайте реализуем props, чтобы мы могли использовать события клика и стили.

Что касается этой части, хотя и можно реализовать это напрямую в renderVNode, давайте попробуем продолжить, учитывая дизайн, следующий оригиналу.

Пожалуйста, обратите внимание на директорию runtime-dom оригинального Vue.js.

https://github.com/vuejs/core/tree/main/packages/runtime-dom/src

На что я хочу, чтобы вы обратили особое внимание, это директория `modules` и файл `patchProp.ts`.

Внутри директории modules есть файлы для манипуляции классами, стилями и другими props.
https://github.com/vuejs/core/tree/main/packages/runtime-dom/src/modules

Все они объединены в функцию patchProp в patchProp.ts и смешаны с nodeOps.

Вместо объяснения словами, я попробую сделать это на основе этого дизайна.

## Создание каркаса для patchProps

Сначала создадим каркас.

```sh
pwd # ~
touch packages/runtime-dom/patchProp.ts
```

Содержимое `runtime-dom/patchProp.ts`

```ts
type DOMRendererOptions = RendererOptions<Node, Element>

const onRE = /^on[^a-z]/
export const isOn = (key: string) => onRE.test(key)

export const patchProp: DOMRendererOptions['patchProp'] = (el, key, value) => {
  if (isOn(key)) {
    // patchEvent(el, key, value); // Мы реализуем это позже
  } else {
    // patchAttr(el, key, value); // Мы реализуем это позже
  }
}
```

Поскольку тип patchProp не определен в RendererOptions, давайте определим его.

```ts
export interface RendererOptions<
  HostNode = RendererNode,
  HostElement = RendererElement
> {
  // Добавляем
  patchProp(el: HostElement, key: string, value: any): void;
  .
  .
  .
```

С этим нам нужно изменить nodeOps, чтобы исключить части, отличные от patchProps.

```ts
// Исключить patchProp
export const nodeOps: Omit<RendererOptions, "patchProp"> = {
  createElement: (tagName) => {
    return document.createElement(tagName);
  },
  .
  .
  .
```

Затем, при генерации рендерера в `runtime-dom/index`, давайте изменим его, чтобы передать patchProp вместе.

```ts
const { render } = createRenderer({ ...nodeOps, patchProp })
```

## Обработчики событий

Давайте реализуем patchEvent.

```sh
pwd # ~
mkdir packages/runtime-dom/modules
touch packages/runtime-dom/modules/events.ts
```

Реализуем events.ts.

```ts
interface Invoker extends EventListener {
  value: EventValue
}

type EventValue = Function

export function addEventListener(
  el: Element,
  event: string,
  handler: EventListener,
) {
  el.addEventListener(event, handler)
}

export function removeEventListener(
  el: Element,
  event: string,
  handler: EventListener,
) {
  el.removeEventListener(event, handler)
}

export function patchEvent(
  el: Element & { _vei?: Record<string, Invoker | undefined> },
  rawName: string,
  value: EventValue | null,
) {
  // vei = vue event invokers
  const invokers = el._vei || (el._vei = {})
  const existingInvoker = invokers[rawName]

  if (value && existingInvoker) {
    // patch
    existingInvoker.value = value
  } else {
    const name = parseName(rawName)
    if (value) {
      // add
      const invoker = (invokers[rawName] = createInvoker(value))
      addEventListener(el, name, invoker)
    } else if (existingInvoker) {
      // remove
      removeEventListener(el, name, existingInvoker)
      invokers[rawName] = undefined
    }
  }
}

function parseName(rawName: string): string {
  return rawName.slice(2).toLocaleLowerCase()
}

function createInvoker(initialValue: EventValue) {
  const invoker: Invoker = (e: Event) => {
    invoker.value(e)
  }
  invoker.value = initialValue
  return invoker
}
```

Это немного длинно, но если разбить его, это очень простой код.

addEventListener - это просто функция для регистрации слушателей событий, как следует из названия.\
Хотя вам действительно нужно удалить его в подходящий момент, мы пока игнорируем это.

В patchEvent мы оборачиваем слушатель функцией, называемой invoker, и регистрируем слушатель.\
Что касается parseName, он просто преобразует имена ключей prop, такие как `onClick` и `onInput`, в нижний регистр, удаляя "on" (например, click, input).
Один момент, на который следует обратить внимание, заключается в том, что для того, чтобы не добавлять дублирующие addEventListeners к одному и тому же элементу, мы добавляем invoker к элементу с именем `_vei` (vue event invokers).\
Обновляя existingInvoker.value во время патча, мы можем обновить обработчик без добавления дублирующих addEventListeners.\
Термин "invoker" просто означает "тот, кто выполняет". Здесь нет более глубокого смысла; это просто объект, который хранит обработчик, который будет фактически выполнен.

Теперь давайте включим это в patchProps и попробуем использовать его в renderVNode.

patchProps

```ts
export const patchProp: DOMRendererOptions['patchProp'] = (el, key, value) => {
  if (isOn(key)) {
    patchEvent(el, key, value)
  } else {
    // patchAttr(el, key, value); // Мы реализуем это позже
  }
}
```

renderVNode в runtime-core/renderer.ts

```ts
  const {
    patchProp: hostPatchProp,
    createElement: hostCreateElement,
    createText: hostCreateText,
    insert: hostInsert,
  } = options;
  .
  .
  .
  function renderVNode(vnode: VNode | string) {
    if (typeof vnode === "string") return hostCreateText(vnode);
    const el = hostCreateElement(vnode.type);

    // Здесь
    Object.entries(vnode.props).forEach(([key, value]) => {
      hostPatchProp(el, key, value);
    });
    .
    .
    .
```

Теперь давайте запустим его в playground. Я попробую отобразить простое оповещение.

```ts
import { createApp, h } from 'chibivue'

const app = createApp({
  render() {
    return h('div', {}, [
      h('p', {}, ['Hello world.']),
      h(
        'button',
        {
          onClick() {
            alert('Hello world!')
          },
        },
        ['click me!'],
      ),
    ])
  },
})

app.mount('#app')
```

Теперь мы можем регистрировать обработчики событий с помощью функции h!

![simple_h_function_event](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/simple_h_function_event.png)

## Попытка поддержки других props

После этого, это просто вопрос делания того же самого с setAttribute.\
Мы реализуем это в `modules/attrs.ts`.\
Я хотел бы, чтобы вы попробовали сами. Ответ будет приложен в конце этой главы в исходном коде, так что, пожалуйста, проверьте его там.\
Как только вы сможете заставить этот код работать, вы достигли цели.

```ts
import { createApp, h } from 'chibivue'

const app = createApp({
  render() {
    return h('div', { id: 'my-app' }, [
      h('p', { style: 'color: red; font-weight: bold;' }, ['Hello world.']),
      h(
        'button',
        {
          onClick() {
            alert('Hello world!')
          },
        },
        ['click me!'],
      ),
    ])
  },
})

app.mount('#app')
```

![simple_h_function_attrs](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/simple_h_function_attrs.png)

Исходный код до этого момента: \
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/10_minimum_example/025_event_handler_and_attrs)
