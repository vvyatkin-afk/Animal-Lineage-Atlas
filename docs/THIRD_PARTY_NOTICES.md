# Third-party notices

## flag-icons 7.6.0

The project includes the 4:3 SVG country flags used by known country-coded records in the polar-bear and hippopotamus atlases. The subset is copied from [lipis/flag-icons](https://github.com/lipis/flag-icons). The upstream project is MIT licensed; its copyright and license text are in [`packages/ui/flags/LICENSE`](../packages/ui/flags/LICENSE) and are copied into each built atlas at `flags/LICENSE`.

The build copies only country codes present in each atlas runtime. Red-panda institution country codes are not currently established in its canonical source data, so that release does not infer or add flags for red-panda records.
