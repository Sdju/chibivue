# Компиляция блоков стилей

## Виртуальные модули

Давайте также поддержим стили. \
В Vite вы можете импортировать CSS файлы, используя расширение `.css`.

```js
import 'app.css'
```

Мы реализуем это, используя виртуальные модули Vite. \
Виртуальные модули позволяют хранить несуществующие файлы в памяти, как если бы они существовали. \
Вы можете использовать опции `load` и `resolveId` для реализации виртуальных модулей.

```ts
export default function myPlugin() {
  const virtualModuleId = 'virtual:my-module'

  return {
    name: 'my-plugin', // Обязательно, отображается в предупреждениях и ошибках
    resolveId(id) {
      if (id === virtualModuleId) {
        return virtualModuleId
      }
    },
    load(id) {
      if (id === virtualModuleId) {
        return `export const msg = "from virtual module"`
      }
    },
  }
}
```

Используя этот механизм, мы будем загружать блок стилей SFC как виртуальный CSS файл.  
Как упоминалось ранее, в Vite достаточно импортировать файл с расширением `.css`, поэтому мы рассмотрим создание виртуального модуля с именем `${имя файла SFC}.css`.

## Реализация виртуального модуля с содержимым блока стилей SFC

Для этого примера давайте рассмотрим файл с именем "App.vue" и реализуем виртуальный модуль с именем "App.vue.css" для его секции стилей.  
Процесс прост: когда загружается файл с именем `**.vue.css`, мы получим SFC с помощью `fs.readFileSync` из пути к файлу без `.css` (т.е. оригинальный файл Vue), распарсим его для извлечения содержимого тега style и вернем это содержимое как код.


```ts
export default function vitePluginChibivue(): Plugin {
  //  ,
  //  ,
  //  ,
  return {
    //  ,
    //  ,
    //  ,
    resolveId(id) {
      // Этот ID - несуществующий путь, но мы обрабатываем его виртуально в load, поэтому мы возвращаем ID, чтобы указать, что он может быть загружен
      if (id.match(/\.vue\.css$/)) return id

      // Для ID, которые не возвращаются здесь, если файл действительно существует, файл будет разрешен, а если нет, будет выброшена ошибка
    },
    load(id) {
      // Обработка при загрузке .vue.css (когда объявлен и загружен импорт)
      if (id.match(/\.vue\.css$/)) {
        const filename = id.replace(/\.css$/, '')
        const content = fs.readFileSync(filename, 'utf-8') // Получить файл SFC обычным способом
        const { descriptor } = parse(content, { filename }) // Распарсить SFC

        // Объединить содержимое и вернуть его как результат
        const styles = descriptor.styles.map(it => it.content).join('\n')
        return { code: styles }
      }
    },

    transform(code, id) {
      if (!filter(id)) return

      const outputs = []
      outputs.push("import * as ChibiVue from 'chibivue'")
      outputs.push(`import '${id}.css'`) // Объявить оператор импорта для ${id}.css
      //  ,
      //  ,
      //  ,
    },
  }
}
```

Теперь давайте проверим в браузере.

![load_virtual_css_module](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/load_virtual_css_module.png)

Похоже, что стили применяются правильно.

В браузере вы можете видеть, что CSS импортирован и файл `.vue.css` генерируется виртуально.

![load_virtual_css_module2](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/load_virtual_css_module2.png)  
![load_virtual_css_module3](https://raw.githubusercontent.com/chibivue-land/chibivue/main/book/images/load_virtual_css_module3.png)

Теперь вы можете использовать SFC!

Исходный код до этого момента:  
[chibivue (GitHub)](https://github.com/chibivue-land/chibivue/tree/main/book/impls/10_minimum_example/070_sfc_compiler4)
