# Что это за репозиторий?
Этот репозиторий содержит примеры кода, который написал я, Леонид Белоусов. 
Весь код, который хранится в этом репозитории, взят из реальной кодовой базы проекта `Ragtime`, над которым я сейчас работаю, без каких-либо изменений. 
Имейте в виду, однако, что этот репозиторий предназначен исключительно для того, чтобы показать, как я пишу исходный код. 
Анализируя расположенные здесь файлы, Вы, конечно, не сможете составить представление о том, какие принципы заложены в платформу и как она работает.
Если Вам это интересно - приглашайте на собеседование :)

# Что такое `Ragtime`?
`Ragtime` - это платформа для построения enterprise - веб-приложений. 
В двух словах работа прикладного программита, который использует `Ragtime`, заключается в следующем: 
- Описать метаданные в xml-файлах. Метаданные - это справочники, регистры, и т п.
- Запустить компилятор Ragime для генерации "системного" исходного кода
- Реализовать back-end логику программы на `C#`
- Релизовать ui-формы на `typescript`

`Ragtime` не требует от прикладного программиста знаний `html`, `css` и прочих специфичных для веб-разработки технологий. 
Типичный прикладной `Ragtime`-программист - это хороший специалист в прикладной области, но (относильно) плохой специалист в области
веб- и backend- разработки.

# Разделы репозитория
## Core
`Core` - это непосредственно `Ragtime`- компилятор. Компилятор генерирует "системные" исходники на основании предоставленных ему метаданных
и анализирует исходные данные, которые написал прикладной программист.

## Main
`Main` - это основной код `Ragime`

