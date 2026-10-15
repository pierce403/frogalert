from pathlib import Path,PurePosixPath
import tarfile,sys
source=Path(sys.argv[1]);destination=Path(sys.argv[2]);archives=list(source.rglob('artifact.tar'))
assert len(archives)==1,'One canonical Pages artifact is required'
destination.mkdir(parents=True,exist_ok=False)
with tarfile.open(archives[0]) as archive:
 for member in archive.getmembers():
  path=PurePosixPath(member.name)
  assert not path.is_absolute() and '..' not in path.parts
  assert member.isfile() or member.isdir(),'Links and special files are not public artifacts'
 archive.extractall(destination,filter='data')
