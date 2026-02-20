*** Settings ***
Library    RPA.Windows
Library    Process

*** Variables ***
${NOTEPAD}    notepad.exe
${FILE}       ProveedoresDeudores.txt

*** Tasks ***
Ejecutar Proceso
    #Run Process    ${NOTEPAD}    ${FILE}
    #Control Window    My CRM (Sample App)
    #Send Keys    id:textBoxPeopleFirstName    E
    Run Process    calc.exe
    Control Window    Calculadora
    Send Keys    id:CalculatorResults    4
    #ejecuta el siguiente comando
    Click    id:num2Button
    Send Keys    id:CalculatorResults    2
    Click    id:plusButton
    Click    id:num1Button
    Click    id:equalButton
    #python -m robot archivo.robot