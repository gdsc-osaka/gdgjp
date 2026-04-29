import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useSubmit } from "react-router";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { type Locale, supportedLngs } from "~/lib/i18n/resources";

export function LocaleSwitcher() {
  const { i18n, t } = useTranslation();
  const location = useLocation();
  const submit = useSubmit();
  const current = i18n.resolvedLanguage as Locale;
  const returnTo = `${location.pathname}${location.search}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("nav.localeLabel")}>
          <Languages className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {supportedLngs.map((lng) => (
          <DropdownMenuCheckboxItem
            key={lng}
            checked={current === lng}
            onCheckedChange={() => {
              if (current === lng) return;
              const data = new FormData();
              data.set("locale", lng);
              data.set("return_to", returnTo);
              void submit(data, { method: "post", action: "/api/locale", replace: true });
            }}
          >
            {lng === "ja" ? t("nav.localeJa") : t("nav.localeEn")}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
