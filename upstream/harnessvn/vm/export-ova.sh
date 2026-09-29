#!/usr/bin/env bash
# HarnessVN - xuat anh qcow2 thanh .ova de dung voi VirtualBox/VMware (khong can QEMU).
#
# Dung: bash export-ova.sh <anh.qcow2> [<ra.ova>]
#   QEMU_DIR=/duong/dan/qemu-da-giai-nen   neu may khong co qemu he thong
#
# .ova = tar chua <ten>.ovf (mo ta may ao), <ten>.vmdk (dia), <ten>.mf (checksum).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
IMG="${1:-}"
OUT="${2:-}"
[ -n "$IMG" ] || { echo "Dung: bash export-ova.sh <anh.qcow2> [<ra.ova>]"; exit 1; }
[ -f "$IMG" ] || { echo "Khong thay anh: $IMG"; exit 1; }

QEMU_IMG_BIN="${QEMU_IMG_BIN:-qemu-img}"
QEMU_DIR="${QEMU_DIR:-}"
if [ -n "$QEMU_DIR" ]; then
  QEMU_IMG_BIN="$QEMU_DIR/usr/bin/qemu-img"
  export LD_LIBRARY_PATH="$QEMU_DIR/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi
command -v "$QEMU_IMG_BIN" >/dev/null 2>&1 || [ -x "$QEMU_IMG_BIN" ] || { echo "THIEU qemu-img (dat QEMU_DIR neu da giai nen qemu)"; exit 1; }

NAME="$(basename "${IMG%.*}")"
[ -n "$OUT" ] || OUT="$(cd "$(dirname "$IMG")" && pwd)/$NAME.ova"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "[1/4] qcow2 -> vmdk (streamOptimized, mot file de dong goi)..."
"$QEMU_IMG_BIN" convert -O vmdk -o subformat=streamOptimized "$IMG" "$WORK/$NAME.vmdk"
VMDK_BYTES="$(stat -c %s "$WORK/$NAME.vmdk")"
CAPACITY="$("$QEMU_IMG_BIN" info --output=json "$IMG" | python3 -c 'import json,sys; print(json.load(sys.stdin)["virtual-size"])')"
echo "[2/4] sinh $NAME.ovf (dia ~$(( CAPACITY / 1073741824 )) GB)..."
cat > "$WORK/$NAME.ovf" <<OVF
<?xml version="1.0" encoding="UTF-8"?>
<Envelope ovf:version="1.0" xml:lang="en-US"
  xmlns="http://schemas.dmtf.org/ovf/envelope/1"
  xmlns:ovf="http://schemas.dmtf.org/ovf/envelope/1"
  xmlns:rasd="http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_ResourceAllocationSettingData"
  xmlns:vssd="http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_VirtualSystemSettingData"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <References>
    <File ovf:href="$NAME.vmdk" ovf:id="file1" ovf:size="$VMDK_BYTES"/>
  </References>
  <DiskSection>
    <Info>Virtual disk information</Info>
    <Disk ovf:capacity="$CAPACITY" ovf:capacityAllocationUnits="byte" ovf:diskId="vmdisk1" ovf:fileRef="file1"
          ovf:format="http://www.vmware.com/interfaces/specifications/vmdk.html#streamOptimized"/>
  </DiskSection>
  <NetworkSection>
    <Info>The list of logical networks</Info>
    <Network ovf:name="VM Network"><Description>Mang cho may ao HarnessVN</Description></Network>
  </NetworkSection>
  <VirtualSystem ovf:id="HarnessVN">
    <Info>HarnessVN - Ubuntu + DeepSeek Harness ban tieng Viet</Info>
    <Name>HarnessVN</Name>
    <OperatingSystemSection ovf:id="94"><Info>Ubuntu 64-bit</Info></OperatingSystemSection>
    <VirtualHardwareSection>
      <Info>Virtual hardware requirements</Info>
      <System>
        <vssd:ElementName>Virtual Hardware Family</vssd:ElementName>
        <vssd:InstanceID>0</vssd:InstanceID>
        <vssd:VirtualSystemIdentifier>HarnessVN</vssd:VirtualSystemIdentifier>
        <vssd:VirtualSystemType>vmx-14</vssd:VirtualSystemType>
      </System>
      <Item><rasd:AllocationUnits>hertz * 10^6</rasd:AllocationUnits><rasd:Description>Number of Virtual CPUs</rasd:Description><rasd:ElementName>2 virtual CPU(s)</rasd:ElementName><rasd:InstanceID>1</rasd:InstanceID><rasd:ResourceType>3</rasd:ResourceType><rasd:VirtualQuantity>2</rasd:VirtualQuantity></Item>
      <Item><rasd:AllocationUnits>byte * 2^20</rasd:AllocationUnits><rasd:Description>Memory Size</rasd:Description><rasd:ElementName>4096MB of memory</rasd:ElementName><rasd:InstanceID>2</rasd:InstanceID><rasd:ResourceType>4</rasd:ResourceType><rasd:VirtualQuantity>4096</rasd:VirtualQuantity></Item>
      <!-- SATA/AHCI, KHONG phai SCSI lsilogic: initramfs cua anh cloud Ubuntu chi co driver
           AHCI/virtio, khong co mptspi -> dia SCSI LSI se dung o 'Gave up waiting for root file
           system device'. Da gap that khi boot thu chinh dia trong .ova voi -device lsi53c895a;
           boot lai voi -device ich9-ahci (dung khai bao nay) thi len binh thuong. -->
      <Item><rasd:Address>0</rasd:Address><rasd:Description>SATA Controller</rasd:Description><rasd:ElementName>SATA controller 0</rasd:ElementName><rasd:InstanceID>3</rasd:InstanceID><rasd:ResourceSubType>ahci</rasd:ResourceSubType><rasd:ResourceType>20</rasd:ResourceType></Item>
      <Item><rasd:AddressOnParent>0</rasd:AddressOnParent><rasd:ElementName>Hard disk 1</rasd:ElementName><rasd:HostResource>ovf:/disk/vmdisk1</rasd:HostResource><rasd:InstanceID>4</rasd:InstanceID><rasd:Parent>3</rasd:Parent><rasd:ResourceType>17</rasd:ResourceType></Item>
      <Item><rasd:Address>1</rasd:Address><rasd:Description>IDE Controller</rasd:Description><rasd:ElementName>IDE Controller</rasd:ElementName><rasd:InstanceID>5</rasd:InstanceID><rasd:ResourceType>5</rasd:ResourceType></Item>
      <Item><rasd:AddressOnParent>0</rasd:AddressOnParent><rasd:ElementName>CD-ROM 1</rasd:ElementName><rasd:InstanceID>6</rasd:InstanceID><rasd:Parent>5</rasd:Parent><rasd:ResourceType>15</rasd:ResourceType></Item>
      <Item><rasd:AddressOnParent>0</rasd:AddressOnParent><rasd:ElementName>Ethernet adapter 1</rasd:ElementName><rasd:InstanceID>7</rasd:InstanceID><rasd:ResourceType>10</rasd:ResourceType></Item>
    </VirtualHardwareSection>
  </VirtualSystem>
</Envelope>
OVF

echo "[3/4] checksum (.mf)..."
( cd "$WORK" && python3 - "$NAME" <<'PY'
import hashlib, sys
name = sys.argv[1]
out = []
for f in (name + '.ovf', name + '.vmdk'):
    digest = hashlib.sha256(open(f, 'rb').read()).hexdigest()
    out.append('SHA256(%s)= %s' % (f, digest))
open(name + '.mf', 'w').write('\n'.join(out) + '\n')
PY
)

echo "[4/4] dong goi $OUT ..."
tar -C "$WORK" -cf "$OUT" "$NAME.ovf" "$NAME.vmdk" "$NAME.mf"
ls -lh "$OUT" | awk '{print "   " $5, $9}'

# [4b] Tu kiem chinh file .ova vua tao: khong de phat hanh mot file hong.
#  - .mf phai khop (nguoi dung chay `sha256sum -c` sau khi giai nen cung phai dung)
#  - OVF phai la XML hop le va KHONG duoc khai bao SCSI LSI (initramfs anh cloud khong co mptspi
#    -> may ao VirtualBox/VMware se dung o 'Gave up waiting for root file system device')
echo "[4b/4] kiem cau truc file .ova..."
CHK="$(mktemp -d)"
trap 'rm -rf "$CHK"' EXIT
tar -xf "$OUT" -C "$CHK"
( cd "$CHK" && sha256sum -c ./*.mf >/dev/null ) \
  || { echo "LOI: checksum trong .ova khong khop"; exit 1; }
grep -q "<rasd:ResourceSubType>ahci</rasd:ResourceSubType>" "$CHK/$NAME.ovf" \
  || { echo "LOI: OVF khong khai bao SATA/AHCI (dia SCSI LSI se khong boot duoc)"; exit 1; }
if grep -q "<rasd:ResourceSubType>lsilogic</rasd:ResourceSubType>" "$CHK/$NAME.ovf"; then
  echo "LOI: OVF con khai bao SCSI lsilogic"; exit 1
fi
python3 -c "import xml.etree.ElementTree as ET,glob; ET.parse(glob.glob('$CHK/*.ovf')[0])" \
  || { echo "LOI: OVF khong phai XML hop le"; exit 1; }
echo "    OK: .mf khop, OVF hop le, dia khai bao SATA/AHCI"

echo
echo "Mo bang VirtualBox: File > Import Appliance > chon file .ova tren"
echo "VMware:             File > Open > chon file .ova tren"
