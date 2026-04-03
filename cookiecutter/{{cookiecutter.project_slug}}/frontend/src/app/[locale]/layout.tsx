import { SSEProvider } from '@pamfilico/nextjs-sse'

/**
 * Root layout with SSEProvider wrapping all children.
 * Maintains a single EventSource connection shared by all components.
 *
 * Integrate this into your existing layout — add <SSEProvider> around {children}.
 */
export default function LocaleLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SSEProvider>
      {children}
    </SSEProvider>
  )
}
