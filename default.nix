{ pkgs ? import <nixpkgs> {} }:
pkgs.mkYarnPackage {
  name = "hw-app-avalanche";
  version = "0.1.0";
  yarnLock = ./yarn.lock;
  src = pkgs.lib.sources.cleanSource ./.;
}
