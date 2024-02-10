{ inputs, cell }: {
  default = inputs.flake-utils.lib.mkApp { drv = cell.packages.hanabi-live; };
}
