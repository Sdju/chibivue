# Слоты

## Реализация слота по умолчанию

Vue имеет функцию под названием слоты, которая включает три типа: слот по умолчанию, именованный слот и слот с областью видимости.
https://vuejs.org/guide/components/slots.html#slots

На этот раз мы реализуем слот по умолчанию среди них.
Желаемый интерфейс разработчика выглядит следующим образом:

https://vuejs.org/guide/extras/render-function.html#passing-slots

```ts
const MyComponent = defineComponent({
  setup(_, { slots }) {
    return () => h('div', {}, [slots.default()])
  },
})

const app = createApp({
  setup() {
    return () => h(MyComponent, {}, () => 'hello')
  },
})
```

Механизм прост. На стороне определения слота мы обеспечиваем получение слотов как setupContext, а при рендеринге компонента с помощью функции h на стороне использования мы просто передаем функцию рендеринга как дочерние элементы.
Возможно, наиболее знакомое использование для всех - это размещение элемента slot в шаблоне SFC, но это требует реализации отдельного компилятора шаблонов, поэтому мы пропустим это на этот раз. (Мы рассмотрим это в разделе Basic Template Compiler.)

Как обычно, добавьте свойство, которое может хранить слоты в экземпляре и смешайте его как SetupContext с createSetupContext.
Измените функцию h так, чтобы она могла принимать функцию рендеринга в качестве третьего аргумента, а не только массив, и если передается функция рендеринга, установите ее как слот по умолчанию экземпляра компонента при создании экземпляра.
Давайте реализуем это до этого момента!

(ShapeFlags был немного изменен из-за реализации normalize в children.)

Исходный код до этого момента:
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/40_basic_component_system/050_component_slot)

## Реализация именованных слотов/слотов с областью видимости

Это расширение слота по умолчанию.
На этот раз давайте попробуем передать объект вместо функции.

Для слотов с областью видимости вам просто нужно определить аргументы функции рендеринга.
Как видите, при использовании функции рендеринга не кажется необходимым различать слоты с областью видимости.
Это правильно, суть слотов - это просто функция обратного вызова, и API предоставляется как слоты с областью видимости, чтобы позволить передавать аргументы в него.
Конечно, мы реализуем компилятор в разделе Basic Template Compiler, который может обрабатывать слоты с областью видимости, но они будут преобразованы в эти формы.

https://vuejs.org/guide/components/slots.html#scoped-slots

```ts
const MyComponent = defineComponent({
  setup(_, { slots }) {
    return () =>
      h('div', {}, [
        slots.default?.(),
        h('br', {}, []),
        slots.myNamedSlot?.(),
        h('br', {}, []),
        slots.myScopedSlot2?.({ message: 'hello!' }),
      ])
  },
})

const app = createApp({
  setup() {
    return () =>
      h(
        MyComponent,
        {},
        {
          default: () => 'hello',
          myNamedSlot: () => 'hello2',
          myScopedSlot2: (scope: { message: string }) =>
            `message: ${scope.message}`,
        },
      )
  },
})
```

Исходный код до этого момента:
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/40_basic_component_system/060_slot_extend)
