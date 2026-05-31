import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
})

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => {
    return <a href={href} {...props}>{children}</a>
  },
}))

// Mock next/dynamic
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<{ default: React.ComponentType }>) => {
    let Component: React.ComponentType | null = null
    const promise = loader()
    promise.then((mod) => {
      Component = 'default' in mod ? mod.default : mod
    })
    return function DynamicComponent(props: Record<string, unknown>) {
      if (Component) return <Component {...props} />
      return null
    }
  },
}))

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'div' || prop === 'section' || prop === 'span' || prop === 'button' || prop === 'p') {
        function MockMotionComponent({
          children,
          ...props
        }: { children?: React.ReactNode; [key: string]: unknown }) {
          const filteredProps: Record<string, unknown> = {}
          for (const [key, value] of Object.entries(props)) {
            if (!['initial', 'animate', 'exit', 'transition', 'variants', 'whileHover', 'whileTap', 'layout', 'layoutId'].includes(key)) {
              filteredProps[key] = value
            }
          }
          const Tag = prop as keyof React.JSX.IntrinsicElements
          return <Tag {...filteredProps}>{children}</Tag>
        }
        MockMotionComponent.displayName = `MockMotion.${String(prop)}`
        return MockMotionComponent
      }
      return undefined
    },
  }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  LayoutGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <img {...props} />,
}))

// Mock next/font/google — the real module is a Next.js build-time macro with
// no runtime implementation, so vitest crashes when component modules call
// font loaders like Geist(). Return stub loaders shaped like the real output
// so layout/font styles still resolve to a usable className/variable.
vi.mock('next/font/google', () => {
  const fontLoader = () => ({
    variable: '--font-mock',
    className: 'font-mock',
    style: { fontFamily: 'mock' },
  })
  // Vitest statically analyses the returned object's keys, so we must list the
  // exports actually used by the app rather than relying on a Proxy.
  return {
    __esModule: true,
    Geist: fontLoader,
    Geist_Mono: fontLoader,
    Noto_Sans_JP: fontLoader,
    Inter: fontLoader,
    Roboto: fontLoader,
    Roboto_Mono: fontLoader,
  }
})

// Mock next/font/local for the same reason — the real loader is a build-time
// macro and is unavailable at vitest runtime.
vi.mock('next/font/local', () => ({
  __esModule: true,
  default: () => ({
    variable: '--font-mock-local',
    className: 'font-mock-local',
    style: { fontFamily: 'mock-local' },
  }),
}))

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Stub scrollIntoView for jsdom
Element.prototype.scrollIntoView = vi.fn()
