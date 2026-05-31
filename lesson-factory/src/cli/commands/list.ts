import { Command } from 'commander'

import { listLessons } from '../../core/lesson-store.js'

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List lesson atom YAML files under lessons/atoms')
    .action(async () => {
      const lessons = await listLessons()
      if (lessons.length === 0) {
        console.log('No lesson atoms found.')
        return
      }

      for (const lesson of lessons) {
        console.log(`${lesson.id}\t${lesson.status}\t${lesson.title}`)
      }
    })
}
