const consonants = 'bcdfghjklmnprstvwxz'
const vowels = 'aeiou'

/** Generate pronounceable ID in CVCVCV pattern */
export function generateId(length = 6): string {
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)]
  let result = ''
  for (let i = 0; i < length; i++) {
    result += i % 2 === 0 ? pick(consonants) : pick(vowels)
  }
  return result
}
