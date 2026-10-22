import { AppHeader } from "@/components/app-header"
import { useRoute } from "@/lib/router"

export function App() {
  const route = useRoute()

  return (
    <div className="pl-safe pr-safe flex h-dvh flex-col overflow-hidden bg-background">
      <AppHeader />
      <main className="grid flex-1 place-items-center p-6 text-muted-foreground">
        {route === "/gallery" ? "Gallery" : "Booth"}
      </main>
    </div>
  )
}

export default App
