# Атрибут key и патч рендеринг (Начало раздела Basic Virtual DOM)

## Критическая ошибка

На самом деле, в текущей реализации патч рендеринга chibivue есть критическая ошибка.
При реализации патч рендеринга,

> Что касается patchChildren, необходимо обрабатывать дочерние элементы динамического размера, добавляя такие атрибуты, как key.

Помните, мы говорили об этом?

Давайте посмотрим, какая проблема возникает на самом деле.
В текущей реализации patchChildren реализован следующим образом:

```ts
const patchChildren = (n1: VNode, n2: VNode, container: RendererElement) => {
  const c1 = n1.children as VNode[]
  const c2 = n2.children as VNode[]

  for (let i = 0; i < c2.length; i++) {
    const child = (c2[i] = normalizeVNode(c2[i]))
    patch(c1[i], child, container)
  }
}
```

Этот цикл основан на длине c2 (т.е. следующего vnode).
Другими словами, он работает только тогда, когда c1 и c2 одинаковы.

![c1c2map](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/c1c2map.png)

Например, рассмотрим случай, когда элементы удаляются.
Поскольку цикл патча основан на c2, патч для четвертого элемента не будет выполнен.

![c1c2map_deleted](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/c1c2map_deleted.png)

Когда это происходит, первые три элемента просто обновляются, а четвертый элемент остается из c1, который не удален.

Давайте посмотрим это в действии.

```ts
import { createApp, h, reactive } from 'chibivue'

const app = createApp({
  setup() {
    const state = reactive({ list: ['a', 'b', 'c', 'd'] })
    const updateList = () => {
      state.list = ['e', 'f', 'g']
    }

    return () =>
      h('div', { id: 'app' }, [
        h(
          'ul',
          {},
          state.list.map(item => h('li', {}, [item])),
        ),
        h('button', { onClick: updateList }, ['update']),
      ])
  },
})

app.mount('#app')
```

Когда вы нажмете кнопку update, это должно выглядеть так:

![patch_bug](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/patch_bug.png)

Хотя список должен был обновиться до `["e", "f", "g"]`, "d" остается.

И на самом деле проблема не только в этом. Давайте рассмотрим случай, когда элементы вставляются.
В настоящее время, поскольку цикл основан на c2, получается так:

![c1c2map_inserted](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/c1c2map_inserted.png)

Однако в реальности был вставлен "new element", и сравнение должно производиться между каждым li 1, li 2, li 3 и li 4 из c1 и c2.

![c1c2map_inserted_correct](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/c1c2map_inserted_correct.png)

Что общего у этих двух проблем, так это то, что "узел, который нужно рассматривать как одинаковый в c1 и c2, не может быть определен".
Чтобы решить это, необходимо назначить ключ элементам и выполнять патч на основе этого ключа.
Теперь давайте посмотрим на объяснение атрибута key в документации Vue.

> Специальный атрибут key в первую очередь используется как подсказка для алгоритма Virtual DOM Vue для идентификации VNodes при сравнении нового списка узлов со старым списком.

https://v3.vuejs.org/guide/migration/key-attribute.html

Как и ожидалось, верно? Возможно, вы слышали совет "не использовать индекс в качестве key для v-for", но на данный момент key неявно устанавливается в индекс, что и является причиной вышеуказанных проблем. (Цикл основан на длине c2, и патчинг выполняется на основе этого индекса)

## Патч на основе атрибута key

И функция, которая реализует это - `patchKeyedChildren`. (Давайте поищем ее в оригинальном Vue.)

Подход заключается в том, чтобы сначала сгенерировать карту ключей и индексов для новых узлов.

```ts
let i = 0
const l2 = c2.length
const e1 = c1.length - 1 // конечный индекс предыдущего узла
const e2 = l2 - 1 // конечный индекс следующего узла

const s1 = i // начальный индекс предыдущего узла
const s2 = i // начальный индекс следующего узла

const keyToNewIndexMap: Map<string | number | symbol, number> = new Map()
for (i = s2; i <= e2; i++) {
  const nextChild = (c2[i] = normalizeVNode(c2[i]))
  if (nextChild.key != null) {
    keyToNewIndexMap.set(nextChild.key, i)
  }
}
```

В оригинальном Vue этот `patchKeyedChildren` разделен на пять частей:

1. синхронизация с начала
2. синхронизация с конца
3. общая последовательность + монтирование
4. общая последовательность + размонтирование
5. неизвестная последовательность

Однако последняя часть, `unknown sequence`, является единственной функционально необходимой, поэтому мы начнем с чтения и реализации этой части.

Сначала забудем о перемещении элементов и выполним патч VNodes на основе ключа.
Используя созданный ранее `keyToNewIndexMap`, вычислим пары n1 и n2 и выполним их патч.
На этом этапе, если есть новые элементы для монтирования или если необходимо размонтирование, выполним эти операции.

Грубо говоря, это выглядит так ↓ (Я пропускаю много деталей. Пожалуйста, прочитайте renderer.ts из vuejs/core для более подробной информации.)

```ts
const toBePatched = e2 + 1
const newIndexToOldIndexMap = new Array(toBePatched) // карта нового индекса к старому индексу
for (i = 0; i < toBePatched; i++) newIndexToOldIndexMap[i] = 0

// Цикл на основе e1 (старой длины)
for (i = 0; i <= e1; i++) {
  const prevChild = c1[i]
  newIndex = keyToNewIndexMap.get(prevChild.key)
  if (newIndex === undefined) {
    // Если его нет в новом, размонтируем его
    unmount(prevChild)
  } else {
    newIndexToOldIndexMap[newIndex] = i + 1 // Формируем карту
    patch(prevChild, c2[newIndex] as VNode, container) // Патч
  }
}

for (i = toBePatched - 1; i >= 0; i--) {
  const nextIndex = i
  const nextChild = c2[nextIndex] as VNode
  if (newIndexToOldIndexMap[i] === 0) {
    // Если карта не существует (остается начальное значение), это означает, что его нужно заново монтировать. (На самом деле он существует и его нет в старом)
    patch(null, nextChild, container, anchor)
  }
}
```

## Перемещение элементов

### Метод

#### Node.insertBefore

В настоящее время мы только обновляем каждый элемент на основе соответствия ключей, поэтому если элемент перемещается, нам нужно написать код для его перемещения в нужное положение.

Сначала поговорим о том, как перемещать элементы. Мы указываем якорь в функции `insert` из `nodeOps`. Якорь, как следует из названия, является точкой привязки, и если вы посмотрите на метод `insert`, реализованный в runtime-dom, вы увидите, что он реализован с помощью метода `insertBefore`.

```ts
export const nodeOps: Omit<RendererOptions, 'patchProp'> = {
  // .
  // .
  // .
  insert: (child, parent, anchor) => {
    parent.insertBefore(child, anchor || null)
  },
}
```

Передавая узел в качестве второго аргумента этому методу, узел будет вставлен прямо перед этим узлом.
https://developer.mozilla.org/en-US/docs/Web/API/Node/insertBefore

Мы используем этот метод для фактического перемещения DOM.

#### LIS (Longest Increasing Subsequence)

Теперь давайте поговорим о том, как написать алгоритм для перемещения. Эта часть немного сложнее.
Операции с DOM намного более затратны по сравнению с выполнением JavaScript, поэтому мы хотим минимизировать количество ненужных перемещений насколько это возможно.
Вот где мы используем алгоритм "Наибольшей возрастающей подпоследовательности" (LIS).
Этот алгоритм находит самую длинную возрастающую подпоследовательность в массиве.
Возрастающая подпоследовательность - это подпоследовательность, в которой элементы расположены в порядке возрастания.
Например, дан следующий массив:

```
[2, 4, 1, 7, 5, 6]
```

Есть несколько возрастающих подпоследовательностей:

```
[2, 4]
[2, 5]
.
.
[2, 4, 7]
[2, 4, 5]
.
.
[2, 4, 5, 6]
.
.
[1, 7]
.
.
[1, 5, 6]
```

Это подпоследовательности, где элементы возрастают. Самая длинная из них - это "Наибольшая возрастающая подпоследовательность".
В данном случае `[2, 4, 5, 6]` является наибольшей возрастающей подпоследовательностью. И в Vue индексы, соответствующие 2, 4, 5 и 6, рассматриваются как результирующий массив (т.е. `[0, 1, 4, 5]`).

Кстати, вот пример функции:

```ts
function getSequence(arr: number[]): number[] {
  const p = arr.slice()
  const result = [0]
  let i, j, u, v, c
  const len = arr.length
  for (i = 0; i < len; i++) {
    const arrI = arr[i]
    if (arrI !== 0) {
      j = result[result.length - 1]
      if (arr[j] < arrI) {
        p[i] = j
        result.push(i)
        continue
      }
      u = 0
      v = result.length - 1
      while (u < v) {
        c = (u + v) >> 1
        if (arr[result[c]] < arrI) {
          u = c + 1
        } else {
          v = c
        }
      }
      if (arrI < arr[result[u]]) {
        if (u > 0) {
          p[i] = result[u - 1]
        }
        result[u] = i
      }
    }
  }
  u = result.length
  v = result[u - 1]
  while (u-- > 0) {
    result[u] = v
    v = p[v]
  }
  return result
}
```

Мы будем использовать эту функцию для вычисления наибольшей возрастающей подпоследовательности из `newIndexToOldIndexMap`, и на основе этого будем использовать `insertBefore` для вставки остальных узлов.

### Concrete Example

Here's a concrete example to make it easier to understand.

Let's consider two arrays of VNodes, `c1` and `c2`. `c1` represents the state before the update, and `c2` represents the state after the update. Each VNode has a `key` attribute (in reality, it holds more information).

```js
c1 = [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' }]
c2 = [{ key: 'a' }, { key: 'b' }, { key: 'd' }, { key: 'c' }]
```

First, let's generate `keyToNewIndexMap` based on `c2` (a map of keys to indices in `c2`).
※ This is the code introduced earlier.

```ts
const keyToNewIndexMap: Map<string | number | symbol, number> = new Map()
for (i = 0; i <= e2; i++) {
  const nextChild = (c2[i] = normalizeVNode(c2[i]))
  if (nextChild.key != null) {
    keyToNewIndexMap.set(nextChild.key, i)
  }
}

// keyToNewIndexMap = { a: 0, b: 1, d: 2, c: 3 }
```

Next, let's generate `newIndexToOldIndexMap`.
※ This is the code introduced earlier.

```ts
// Initialization

const toBePatched = c2.length
const newIndexToOldIndexMap = new Array(toBePatched) // Map of new indices to old indices
for (i = 0; i < toBePatched; i++) newIndexToOldIndexMap[i] = 0

// newIndexToOldIndexMap = [0, 0, 0, 0]
```

```ts
// Perform patch and generate newIndexToOldIndexMap for move

// Loop based on e1 (old len)
for (i = 0; i <= e1; i++) {
  const prevChild = c1[i]
  newIndex = keyToNewIndexMap.get(prevChild.key)
  if (newIndex === undefined) {
    // If it doesn't exist in the new array, unmount it
    unmount(prevChild)
  } else {
    newIndexToOldIndexMap[newIndex] = i + 1 // Form the map
    patch(prevChild, c2[newIndex] as VNode, container) // Perform patch
  }
}

// newIndexToOldIndexMap = [1, 2, 4, 3]
```

Then, obtain the longest increasing subsequence from the obtained `newIndexToOldIndexMap` (new implementation starts here).

```ts
const increasingNewIndexSequence = getSequence(newIndexToOldIndexMap)
// increasingNewIndexSequence  = [0, 1, 3]
```

```ts
j = increasingNewIndexSequence.length - 1
for (i = toBePatched - 1; i >= 0; i--) {
  const nextIndex = i
  const nextChild = c2[nextIndex] as VNode
  const anchor =
    nextIndex + 1 < l2 ? (c2[nextIndex + 1] as VNode).el : parentAnchor // ※ parentAnchor はとりあえず引数で受け取った anchor だと思ってもらえれば。

  if (newIndexToOldIndexMap[i] === 0) {
    // newIndexToOldIndexMap は初期値が 0 なので、0 の場合は古い要素への map が存在しない、つまり新しい要素だというふうに判定している。
    patch(null, nextChild, container, anchor)
  } else {
    // i と increasingNewIndexSequence[j] が一致しなければ move する
    if (j < 0 || i !== increasingNewIndexSequence[j]) {
      move(nextChild, container, anchor)
    } else {
      j--
    }
  }
}
```

### Let's implement it.

Now that we have explained the approach in detail, let's actually implement `patchKeyedChildren`. Here is a summary of the steps:

1. Prepare the `anchor` for bucket relay (used for inserting in `move`).
2. Create a map of keys and indices based on `c2`.
3. Create a map of indices in `c2` and `c1` based on the key map.  
   At this stage, perform the patching process in both `c1`-based and `c2`-based loops (excluding `move`).
4. Find the longest increasing subsequence based on the map obtained in step 3.
5. Perform `move` based on the subsequence obtained in step 4 and `c2`.

You can refer to the original Vue implementation or the chibivue implementation for guidance. (I recommend reading the original Vue implementation while following along.)
