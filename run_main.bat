@echo off
echo ======================================================================
echo  ISRO Chandrayaan-1 TMC Lunar Image Registration Pipeline - CLI Runner
echo ======================================================================
echo.
echo Running main.py for pair_001 with Homography...
python main.py --pair pair_001 --transform homography --nfeatures 15000
echo.
echo Pipeline finished. Check outputs in outputs/pair_001/
pause
