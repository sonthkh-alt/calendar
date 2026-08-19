# Ky so bang chung thu tren USB token (SafeNet eToken) thong qua kho chung thu Windows.
# Khong dung PKCS#11 truc tiep: CSP/KSP cua SafeNet da dang ky voi Windows nen .NET goi duoc,
# va chinh SafeNet se hien hop nhap ma PIN.
#
#   -Mode list                      -> liet ke chung thu co khoa rieng (JSON ra -Out)
#   -Mode sign -In <file> -Out <file> -Thumbprint <...> [-Sha1]
#                                   -> ky PKCS#7 detached (DER) tren noi dung file -In
param(
  [Parameter(Mandatory = $true)][ValidateSet('list', 'sign', 'verify')][string]$Mode,
  [string]$In,
  [string]$Out,
  [string]$Sig,
  [string]$Thumbprint,
  [switch]$Sha1
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

function Write-Utf8($path, $text) {
  [System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

function Get-MyCerts {
  $store = New-Object System.Security.Cryptography.X509Certificates.X509Store('My', 'CurrentUser')
  $store.Open('ReadOnly')
  $list = @($store.Certificates | Where-Object { $_.HasPrivateKey })
  $store.Close()
  return $list
}

if ($Mode -eq 'list') {
  # LUU Y: PowerShell KHONG phan biet hoa thuong ten bien -> dat ten khac $Out (tham so)
  $rows = @()
  foreach ($c in Get-MyCerts) {
    $ku = ''
    foreach ($ext in $c.Extensions) {
      if ($ext.Oid.Value -eq '2.5.29.15') { $ku = $ext.KeyUsages.ToString() }
    }
    $rows += [pscustomobject]@{
      thumbprint     = $c.Thumbprint
      subject        = $c.Subject
      subjectName    = $c.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
      issuer         = $c.Issuer
      issuerName     = $c.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $true)
      notBefore      = $c.NotBefore.ToString('s')
      notAfter       = $c.NotAfter.ToString('s')
      keyUsage       = $ku
      canSignDocument = ($ku -eq '' -or $ku -match 'DigitalSignature' -or $ku -match 'NonRepudiation')
    }
  }
  Write-Utf8 $Out (ConvertTo-Json -InputObject @($rows) -Depth 4)
  exit 0
}

if ($Mode -eq 'verify') {
  # Kiem tra chu ky PKCS#7 detached tren noi dung file -In (dung cho kiem thu)
  $content = [System.IO.File]::ReadAllBytes($In)
  $der = [System.IO.File]::ReadAllBytes($Sig)
  $ci = New-Object System.Security.Cryptography.Pkcs.ContentInfo(, $content)
  $cms = New-Object System.Security.Cryptography.Pkcs.SignedCms($ci, $true)
  $cms.Decode($der)
  $cms.CheckSignature($true)   # $true = bo qua kiem tra chuoi tin cay
  $signer = $cms.SignerInfos[0]
  $res = [pscustomobject]@{
    ok        = $true
    subject   = $signer.Certificate.Subject
    digestOid = $signer.DigestAlgorithm.Value
    detached  = $cms.Detached
  }
  Write-Utf8 $Out (ConvertTo-Json -InputObject $res -Depth 3)
  exit 0
}

# ----- Mode = sign -----
if (-not $Thumbprint) { throw 'Thieu -Thumbprint.' }
$tp = ($Thumbprint -replace '[^0-9A-Fa-f]', '').ToUpper()
$cert = Get-MyCerts | Where-Object { $_.Thumbprint -eq $tp } | Select-Object -First 1
if (-not $cert) { throw "Khong tim thay chung thu co khoa rieng voi thumbprint $tp (da cam token chua?)." }

$bytes = [System.IO.File]::ReadAllBytes($In)
$contentInfo = New-Object System.Security.Cryptography.Pkcs.ContentInfo(, $bytes)
# detached = $true: noi dung KHONG nhung vao chu ky (dung chuan /adbe.pkcs7.detached cua PDF)
$cms = New-Object System.Security.Cryptography.Pkcs.SignedCms($contentInfo, $true)
$signer = New-Object System.Security.Cryptography.Pkcs.CmsSigner($cert)
if ($Sha1) {
  $signer.DigestAlgorithm = New-Object System.Security.Cryptography.Oid('1.3.14.3.2.26')      # SHA-1
} else {
  $signer.DigestAlgorithm = New-Object System.Security.Cryptography.Oid('2.16.840.1.101.3.4.2.1') # SHA-256
}
# Kem ca chuoi chung thu de trinh doc PDF kiem tra duoc duong dan tin cay
$signer.IncludeOption = [System.Security.Cryptography.X509Certificates.X509IncludeOption]::WholeChain
$signer.SignedAttributes.Add((New-Object System.Security.Cryptography.Pkcs.Pkcs9SigningTime([DateTime]::Now))) | Out-Null

# Buoc nay lam SafeNet hien hop nhap ma PIN cua token
$cms.ComputeSignature($signer)
[System.IO.File]::WriteAllBytes($Out, $cms.Encode())
exit 0
