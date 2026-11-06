import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const replace = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }))

import StatsPage from "@/app/stats/page"
import HistoryPage from "@/app/history/page"
import SettingsPage from "@/app/settings/page"
import { AccountMenu } from "@/components/AccountMenu"

describe("anciennes pages du menu compte", () => {
  it.each([
    ["/stats", StatsPage],
    ["/history", HistoryPage],
    ["/settings", SettingsPage],
  ])("%s renvoie vers Mon compte", (_path, Page) => {
    replace.mockClear()
    render(<Page />)
    expect(replace).toHaveBeenCalledWith("/profile/")
  })

  it("le rond « Mon compte » mène tout droit à l'écran", () => {
    const { getByRole } = render(<AccountMenu />)
    expect(getByRole("link", { name: "Mon compte" })).toHaveAttribute("href", expect.stringMatching(/^\/profile\/?$/))
  })
})
