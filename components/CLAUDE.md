# Shared components

`AvatarContext` (`components/avatar-context.tsx`) shares the current avatar URL between the layout-rendered navbar and the member detail page, so an upload does not force a layout re-render. `PortalShell` reads the initial URL itself rather than taking it as a prop; after mount the context is the only thing that changes it. That read makes it an async server component importing `lib/prisma`, so unlike its neighbours in `components/` it cannot be imported from a client component.
