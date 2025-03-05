# Минимальный Virtual DOM

## Для чего используется Virtual DOM?

Внедрив систему реактивности в предыдущей главе, мы смогли динамически обновлять экран. Давайте еще раз взглянем на содержимое текущей функции рендеринга.

```ts
const render: RootRenderFunction = (vnode, container) => {
  while (container.firstChild) container.removeChild(container.firstChild)
  const el = renderVNode(vnode)
  hostInsert(el, container)
}
```

Некоторые могли заметить в предыдущей главе, что в этой функции много лишнего.

Взгляните на playground.

```ts
const app = createApp({
  setup() {
    const state = reactive({ count: 0 })
    const increment = () => state.count++

    return function render() {
      return h('div', { id: 'my-app' }, [
        h('p', {}, [`count: ${state.count}`]),
        h('button', { onClick: increment }, ['increment']),
      ])
    }
  },
})
```

Проблема в том, что при выполнении increment изменяется только часть `count: ${state.count}`, но в renderVNode все DOM-элементы удаляются и создаются заново с нуля. Это кажется очень расточительным. \
Хотя сейчас все работает нормально, потому что приложение еще маленькое, легко представить, что производительность будет сильно снижена, если придется заново создавать сложный DOM с нуля каждый раз при разработке веб-приложения. \
Поэтому, поскольку у нас уже есть Virtual DOM, мы хотим реализовать решение, которое сравнивает текущий Virtual DOM с предыдущим и обновляет только те части, где есть различия, используя операции DOM. \
Это и есть основная тема данной главы.

Давайте посмотрим, что мы хотим сделать в исходном коде. Когда у нас есть компонент, подобный приведенному выше, возвращаемое значение функции рендеринга становится Virtual DOM, как показано ниже. В момент начального рендеринга count равен 0, поэтому он выглядит так:

```ts
const vnode = {
  type: "div",
  props: { id: "my-app" },
  children: [
    {
      type: "p",
      props: {},
      children: [`count: 0`]
    },
    {
      type: "button",
      { onClick: increment },
      ["increment"]
    }
  ]
}
```

Давайте сохраним этот vnode и создадим другой vnode для следующего рендеринга. Вот vnode после первого нажатия на кнопку:

```ts
const nextVnode = {
  type: "div",
  props: { id: "my-app" },
  children: [
    {
      type: "p",
      props: {},
      children: [`count: 1`] // Хотим обновить только эту часть
    },
    {
      type: "button",
      { onClick: increment },
      ["increment"]
    }
  ]
}
```

Теперь с этими двумя vnode экран находится в состоянии vnode (до того, как он станет nextVnode). \
Мы хотим передать эти два в функцию под названием patch и отрендерить только различия.

```ts
const vnode = {...}
const nextVnode = {...}
patch(vnode, nextVnode, container)
```

Я представил название функции ранее, но этот дифференциальный рендеринг называется "patch". \
Его также иногда называют "reconciliation" (согласование). Используя эти два Virtual DOM, вы можете эффективно обновлять экран.

## Перед реализацией функции patch

Это не напрямую связано с основной темой, но давайте сделаем небольшой рефакторинг здесь (потому что это удобно для того, о чем мы собираемся говорить дальше). \
Давайте создадим функцию под названием createVNode в vnode.ts и сделаем так, чтобы функция h вызывала ее.

```ts
export function createVNode(
  type: VNodeTypes,
  props: VNodeProps | null,
  children: unknown,
): VNode {
  const vnode: VNode = { type, props, children: [] }
  return vnode
}
```

Изменим также функцию h.

```ts
export function h(
  type: string,
  props: VNodeProps,
  children: (VNode | string)[],
) {
  return createVNode(type, props, children)
}
```

Теперь перейдем к основному моменту. До сих пор тип маленького элемента, который имеет VNode, был `(Vnode | string)[]`, но недостаточно просто обрабатывать Text как строку, поэтому давайте попробуем унифицировать его как VNode. \
Text - это не просто строка, он существует как HTML TextElement, поэтому содержит больше информации, чем просто строка. \
Мы хотим обрабатывать его как VNode, чтобы управлять окружающей информацией. \
В частности, давайте использовать символ Text, чтобы иметь его как тип VNode. \
Например, когда есть текст вроде `"hello"`,

```ts
{
  type: Text,
  props: null,
  children: "hello"
}
```

это представление.

Также стоит отметить, что когда выполняется функция h, мы продолжим использовать обычное выражение, и мы будем преобразовывать его, применяя функцию под названием normalize в функции рендеринга для представления Text, как упомянуто выше. Это делается для соответствия оригинальному Vue.js.

`~/packages/runtime-core/vnode.ts`;

```ts
export const Text = Symbol();

export type VNodeTypes = string | typeof Text;

export interface VNode<HostNode = any> {
  type: VNodeTypes;
  props: VNodeProps | null;
  children: VNodeNormalizedChildren;
}

export interface VNodeProps {
  [key: string]: any;
}

// Тип после нормализации
export type VNodeNormalizedChildren = string | VNodeArrayChildren;
export type VNodeArrayChildren = Array<VNodeArrayChildren | VNodeChildAtom>;

export type VNodeChild = VNodeChildAtom | VNodeArrayChildren;
type VNodeChildAtom = VNode | string;

export function createVNode(..){..} // опущено

// Реализуем функцию normalize (используется в renderer.ts)
export function normalizeVNode(child: VNodeChild): VNode {
  if (typeof child === "object") {
    return { ...child } as VNode;
  } else {
    // Преобразуем строку в желаемую форму, представленную ранее
    return createVNode(Text, null, String(child));
  }
}
```

Теперь Text может обрабатываться как VNode.

## Дизайн функции patch

Сначала давайте рассмотрим дизайн функции patch в кодовой базе. \
(Нам не нужно реализовывать ее здесь, просто понять ее.) \
Функция patch сравнивает два vnode, vnode1 и vnode2. Однако vnode1 изначально не существует. \
Поэтому функция patch разделена на два процесса: "initial (генерация dom из vnode2)" и "обновление разницы между vnode1 и vnode2". \
Эти процессы называются "mount" и "patch" соответственно. \
И они выполняются отдельно для ElementNode и TextNode (объединены как "process" с названием "mount" и "patch" для каждого).

![patch_fn_architecture](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/patch_fn_architecture.drawio.png)

```ts
const patch = (
  n1: VNode | string | null,
  n2: VNode | string,
  container: HostElement,
) => {
  const { type } = n2
  if (type === Text) {
    processText(n1, n2, container)
  } else {
    processElement(n1, n2, container)
  }
}

const processElement = (
  n1: VNode | null,
  n2: VNode,
  container: HostElement,
) => {
  if (n1 === null) {
    mountElement(n2, container)
  } else {
    patchElement(n1, n2)
  }
}

const processText = (n1: string | null, n2: string, container: HostElement) => {
  if (n1 === null) {
    mountText(n2, container)
  } else {
    patchText(n1, n2)
  }
}
```

## Фактическая реализация

Теперь давайте фактически реализуем функцию patch для Virtual DOM. \
Во-первых, мы хотим иметь ссылку на реальный DOM в vnode, когда он монтируется, будь то Element или Text.\
Поэтому добавим свойство "el" к vnode.

`~/packages/runtime-core/vnode.ts`

```ts
export interface VNode<HostNode = RendererNode> {
  type: VNodeTypes
  props: VNodeProps | null
  children: VNodeNormalizedChildren
  el: HostNode | undefined // [!code ++]
}
```

Теперь перейдем к `~/packages/runtime-core/renderer.ts`. \
Мы реализуем это внутри функции `createRenderer` и удалим функцию `renderVNode`.

```ts
export function createRenderer(options: RendererOptions) {
  // .
  // .
  // .

  const patch = (n1: VNode | null, n2: VNode, container: RendererElement) => {
    const { type } = n2
    if (type === Text) {
      // processText(n1, n2, container);
    } else {
      // processElement(n1, n2, container);
    }
  }
}
```

Давайте начнем реализацию с `processElement` и `mountElement`.

```ts
const processElement = (
  n1: VNode | null,
  n2: VNode,
  container: RendererElement,
) => {
  if (n1 === null) {
    mountElement(n2, container)
  } else {
    // patchElement(n1, n2);
  }
}

const mountElement = (vnode: VNode, container: RendererElement) => {
  let el: RendererElement
  const { type, props } = vnode
  el = vnode.el = hostCreateElement(type as string)

  mountChildren(vnode.children, el) // TODO:

  if (props) {
    for (const key in props) {
      hostPatchProp(el, key, props[key])
    }
  }

  hostInsert(el, container)
}
```

Поскольку это элемент, нам также нужно монтировать его дочерние элементы. \
Давайте используем функцию `normalize`, которую мы создали ранее.

```ts
const mountChildren = (children: VNode[], container: RendererElement) => {
  for (let i = 0; i < children.length; i++) {
    const child = (children[i] = normalizeVNode(children[i]))
    patch(null, child, container)
  }
}
```

С этим мы реализовали монтирование элементов. \
Далее перейдем к монтированию Text. \
Однако это просто простая операция DOM. \
В объяснении дизайна мы разделили его на функции `mountText` и `patchText`, но поскольку обработки немного и не ожидается, что она станет более сложной в будущем, давайте напишем ее напрямую.

```ts
const processText = (
  n1: VNode | null,
  n2: VNode,
  container: RendererElement,
) => {
  if (n1 == null) {
    hostInsert((n2.el = hostCreateText(n2.children as string)), container)
  } else {
    // TODO: patch
  }
}
```

Теперь, когда монтирование начального рендеринга завершено, давайте переместим некоторую обработку из функции `mount` в `createAppAPI` в функцию `render`, чтобы мы могли хранить два vnode. \
В частности, мы передаем `rootComponent` в функцию `render` и выполняем регистрацию ReactiveEffect внутри нее.

```ts
return function createApp(rootComponent) {
  const app: App = {
    mount(rootContainer: HostElement) {
      // Просто передаем rootComponent
      render(rootComponent, rootContainer)
    },
  }
}
```

```ts
const render: RootRenderFunction = (rootComponent, container) => {
  const componentRender = rootComponent.setup!()

  let n1: VNode | null = null

  const updateComponent = () => {
    const n2 = componentRender()
    patch(n1, n2, container)
    n1 = n2
  }

  const effect = new ReactiveEffect(updateComponent)
  effect.run()
}
```

Теперь давайте попробуем рендерить в playground, чтобы увидеть, работает ли это!

Поскольку мы еще не реализовали функцию patch, экран не будет обновляться.

Итак, давайте продолжим писать функцию patch.

```ts
const patchElement = (n1: VNode, n2: VNode) => {
  const el = (n2.el = n1.el!)

  const props = n2.props

  patchChildren(n1, n2, el)

  for (const key in props) {
    if (props[key] !== n1.props?.[key]) {
      hostPatchProp(el, key, props[key])
    }
  }
}

const patchChildren = (n1: VNode, n2: VNode, container: RendererElement) => {
  const c1 = n1.children as VNode[]
  const c2 = n2.children as VNode[]

  for (let i = 0; i < c2.length; i++) {
    const child = (c2[i] = normalizeVNode(c2[i]))
    patch(c1[i], child, container)
  }
}
```

То же самое для текстовых узлов.

```ts
const processText = (
  n1: VNode | null,
  n2: VNode,
  container: RendererElement,
) => {
  if (n1 == null) {
    hostInsert((n2.el = hostCreateText(n2.children as string)), container)
  } else {
    // Добавляем логику patch
    const el = (n2.el = n1.el!)
    if (n2.children !== n1.children) {
      hostSetText(el, n2.children as string)
    }
  }
}
```

※ Что касается patchChildren, обычно нам нужно обрабатывать дочерние элементы динамической длины, добавляя атрибуты key, но поскольку мы реализуем небольшой Virtual DOM, мы не будем здесь рассматривать практичность этого. \
Если вам интересно, обратитесь к разделу Basic Virtual DOM. \
Здесь мы стремимся понять реализацию и роль Virtual DOM до определенной степени.

Теперь, когда мы можем выполнять дифференциальный рендеринг, давайте взглянем на playground.

![patch_rendering](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/patch_rendering.png)

Мы успешно реализовали патчинг с использованием Virtual DOM!!!!! Поздравляем!

Исходный код до этого момента: [GitHub](https://github.com/chibivue-land/chibivue/tree/main/book/impls/10_minimum_example/040_vdom_system)
